import 'webextension-polyfill';
import { listingIdOf } from '@extension/shared';
import {
  addFavorite,
  cascadeRemoveListIdFromListings,
  clearGeocodes,
  clearListings,
  deleteList,
  GEOCODE_HIT_TTL_MS,
  GEOCODE_MISS_TTL_MS,
  LISTING_TTL_MS,
  listAllListings,
  listAllLists,
  listFavorites,
  normalizeAddress,
  overlayPrefStorage,
  patchListing,
  readGeocode,
  readList,
  readListing,
  removeFavorite,
  writeGeocode,
  writeList,
  writeListing,
} from '@extension/storage';
import type { Listing, ListingList, RawListing, RuntimeMessage } from '@extension/shared';
import type { ListRecord } from '@extension/storage';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const REQUEST_SPACING_MS = 1100;
const PAUSE_ON_ERROR_MS = 30 * 1000;
const USER_AGENT_VERSION = chrome.runtime.getManifest().version;
const USER_AGENT = `Mapa-Nehnutelnosti/${USER_AGENT_VERSION} (https://github.com/em/mapa-nehnutelnosti-chrome-extension)`;
const DEFAULT_LIST_NAME = 'Predvolený zoznam';

type QueueItem = {
  address: string;
  normalized: string;
  listingId: string;
  tabId: number;
};

const queue: QueueItem[] = [];
const enqueued = new Set<string>();
let lastDispatchAt = 0;
let paused = false;
let consecutiveErrors = 0;
let processing = false;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const broadcast = (tabId: number, message: RuntimeMessage) => {
  void chrome.tabs.sendMessage(tabId, message).catch(() => {
    /* tab gone */
  });
};

const fetchNominatim = async (q: string): Promise<{ lat: number; lng: number } | null> => {
  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=sk&limit=1&accept-language=sk`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!data || data.length === 0) return null;
  const { lat, lon } = data[0];
  const latN = Number.parseFloat(lat);
  const lngN = Number.parseFloat(lon);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
  return { lat: latN, lng: lngN };
};

const announceGeocoded = async (item: QueueItem, coord: { lat: number; lng: number }) => {
  await patchListing<Listing>(item.listingId, { coord });
  broadcast(item.tabId, { type: 'LISTING_GEOCODED', id: item.listingId, coord });
};

const announceFailed = (item: QueueItem) => {
  broadcast(item.tabId, { type: 'GEOCODE_FAILED', id: item.listingId });
};

const processOne = async (item: QueueItem) => {
  const cached = await readGeocode(item.normalized);
  if (cached) {
    if ('lat' in cached) await announceGeocoded(item, { lat: cached.lat, lng: cached.lng });
    else announceFailed(item);
    return;
  }

  const spacing = REQUEST_SPACING_MS - (Date.now() - lastDispatchAt);
  if (spacing > 0) await sleep(spacing);

  try {
    const result = await fetchNominatim(item.address);
    lastDispatchAt = Date.now();
    consecutiveErrors = 0;

    if (result) {
      await writeGeocode(item.normalized, { ...result, expiresAt: Date.now() + GEOCODE_HIT_TTL_MS });
      await announceGeocoded(item, result);
    } else {
      await writeGeocode(item.normalized, { miss: true, expiresAt: Date.now() + GEOCODE_MISS_TTL_MS });
      announceFailed(item);
    }
  } catch (err) {
    lastDispatchAt = Date.now();
    consecutiveErrors += 1;
    console.warn('[mapa-nehnutelnosti] geocode error', err);
    announceFailed(item);
    if (consecutiveErrors >= 3) {
      paused = true;
      setTimeout(() => {
        paused = false;
        consecutiveErrors = 0;
        void runQueue();
      }, PAUSE_ON_ERROR_MS);
    }
  }
};

const runQueue = async () => {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0 && !paused) {
      const item = queue.shift()!;
      enqueued.delete(item.listingId);
      await processOne(item);
    }
  } finally {
    processing = false;
  }
};

const enqueue = (item: QueueItem) => {
  if (enqueued.has(item.listingId)) return;
  enqueued.add(item.listingId);
  queue.push(item);
  void runQueue();
};

const ensureActiveList = async (): Promise<string> => {
  const pref = await overlayPrefStorage.get();
  if (pref.activeListId) {
    const existing = await readList(pref.activeListId);
    if (existing) return existing.id;
  }
  // Fall through: either no activeListId or it's been deleted. Pick the
  // oldest list, or create the default.
  const all = await listAllLists();
  if (all.length > 0) {
    await overlayPrefStorage.set({ ...pref, activeListId: all[0].id });
    return all[0].id;
  }
  const created: ListRecord = {
    id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: DEFAULT_LIST_NAME,
    createdAt: Date.now(),
  };
  await writeList(created);
  await overlayPrefStorage.set({ ...pref, activeListId: created.id });
  return created.id;
};

const toListingList = (r: ListRecord): ListingList => ({ id: r.id, name: r.name, createdAt: r.createdAt });

const handleListingsExtracted = async (listings: RawListing[], tabId: number) => {
  const now = Date.now();
  const activeListId = await ensureActiveList();

  // Inform the overlay immediately so it can render listings before any IDB
  // or geocoding work finishes.
  broadcast(tabId, { type: 'LISTINGS_EXTRACTED', listings });

  await Promise.all(
    listings.map(async raw => {
      const id = listingIdOf(raw.site, raw.siteListingId);
      const existing = await readListing<Listing>(id);
      const listIds = existing?.listIds?.includes(activeListId)
        ? existing.listIds
        : [...(existing?.listIds ?? []), activeListId];
      await writeListing(id, {
        ...raw,
        id,
        listIds,
        coord: existing?.coord,
        expiresAt: now + LISTING_TTL_MS,
      });

      if (existing?.coord) {
        broadcast(tabId, { type: 'LISTING_GEOCODED', id, coord: existing.coord });
        return;
      }
      if (!raw.addressRaw) return;
      const normalized = normalizeAddress(raw.addressRaw);
      if (!normalized) return;
      enqueue({ address: raw.addressRaw, normalized, listingId: id, tabId });
    }),
  );
};

const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const listingsToCsv = (rows: Listing[]): string => {
  const header = ['id', 'site', 'title', 'url', 'addressRaw', 'priceEur', 'areaSqm', 'lat', 'lng', 'thumbnailUrl'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.site,
        r.title,
        r.url,
        r.addressRaw,
        r.priceEur ?? '',
        r.areaSqm ?? '',
        r.coord?.lat ?? '',
        r.coord?.lng ?? '',
        r.thumbnailUrl ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return lines.join('\n');
};

const handleHydrate = async () => {
  const activeListId = await ensureActiveList();
  const [listings, favorites, lists] = await Promise.all([listAllListings<Listing>(), listFavorites(), listAllLists()]);
  // Filter listings by active list — map shows only the current list.
  const filtered = listings.filter(l => l.listIds?.includes(activeListId));
  return {
    type: 'HYDRATE_RESPONSE' as const,
    listings: filtered,
    favorites,
    lists: lists.map(toListingList),
    activeListId,
  };
};

const handleCreateList = async (name: string): Promise<ListingList> => {
  const list: ListRecord = {
    id: `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Nový zoznam',
    createdAt: Date.now(),
  };
  await writeList(list);
  return toListingList(list);
};

const handleRenameList = async (id: string, name: string) => {
  const existing = await readList(id);
  if (!existing) return;
  await writeList({ ...existing, name: name.trim() || existing.name });
};

const handleDeleteList = async (id: string) => {
  await cascadeRemoveListIdFromListings<Listing>(id);
  await deleteList(id);
  // If the deleted list was active, fall back to another (auto-creating one if needed).
  const pref = await overlayPrefStorage.get();
  if (pref.activeListId === id) {
    await overlayPrefStorage.set({ ...pref, activeListId: '' });
    await ensureActiveList();
  }
};

const handleExportListCsv = async (id: string) => {
  const list = await readList(id);
  if (!list) return { csv: '', name: 'export.csv' };
  const all = await listAllListings<Listing>();
  const rows = all.filter(l => l.listIds?.includes(id));
  return { csv: listingsToCsv(rows), name: `${list.name.replace(/[^\w-]+/g, '_')}.csv` };
};

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'HYDRATE_REQUEST') {
    void handleHydrate().then(sendResponse);
    return true;
  }

  if (message.type === 'TOGGLE_FAVORITE') {
    const op = message.isFavorite ? addFavorite(message.id) : removeFavorite(message.id);
    void op.then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'CLEAR_CACHE') {
    void Promise.all([clearGeocodes(), clearListings()]).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'CREATE_LIST') {
    void handleCreateList(message.name).then(list => sendResponse({ type: 'CREATE_LIST_RESPONSE', list }));
    return true;
  }
  if (message.type === 'RENAME_LIST') {
    void handleRenameList(message.id, message.name).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'DELETE_LIST') {
    void handleDeleteList(message.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'EXPORT_LIST_CSV') {
    void handleExportListCsv(message.id).then(({ csv, name }) =>
      sendResponse({ type: 'EXPORT_LIST_CSV_RESPONSE', csv, name }),
    );
    return true;
  }

  if (typeof tabId !== 'number') return false;

  if (message.type === 'LISTINGS_EXTRACTED') {
    void handleListingsExtracted(message.listings, tabId).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'LISTINGS_REMOVED') {
    broadcast(tabId, message);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

console.log('[mapa-nehnutelnosti] background loaded');

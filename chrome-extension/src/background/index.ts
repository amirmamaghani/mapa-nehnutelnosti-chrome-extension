import 'webextension-polyfill';
import { listingIdOf } from '@extension/shared';
import {
  addFavorite,
  clearGeocodes,
  clearListings,
  GEOCODE_HIT_TTL_MS,
  GEOCODE_MISS_TTL_MS,
  LISTING_TTL_MS,
  listAllListings,
  listFavorites,
  normalizeAddress,
  patchListing,
  readGeocode,
  readListing,
  removeFavorite,
  writeGeocode,
  writeListing,
} from '@extension/storage';
import type { Listing, RawListing, RuntimeMessage } from '@extension/shared';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const REQUEST_SPACING_MS = 1100;
const PAUSE_ON_ERROR_MS = 30 * 1000;
const USER_AGENT_VERSION = chrome.runtime.getManifest().version;
const USER_AGENT = `Mapa-Nehnutelnosti/${USER_AGENT_VERSION} (https://github.com/em/mapa-nehnutelnosti-chrome-extension)`;

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

// Dedup per-listing — different listings that share an address still each
// queue and each get their coord written, even though Nominatim is only hit
// once (via the geocode cache).
const enqueue = (item: QueueItem) => {
  if (enqueued.has(item.listingId)) return;
  enqueued.add(item.listingId);
  queue.push(item);
  void runQueue();
};

const handleListingsExtracted = async (listings: RawListing[], tabId: number) => {
  const now = Date.now();

  // Inform the overlay immediately so it can render listings before any IDB
  // or geocoding work finishes.
  broadcast(tabId, { type: 'LISTINGS_EXTRACTED', listings });

  // Per listing: merge with any existing record (to preserve a known coord),
  // write it back, and either re-broadcast the cached coord or enqueue a new
  // geocode. All in parallel so 30 listings cost ~one IDB round-trip, not 30.
  await Promise.all(
    listings.map(async raw => {
      const id = listingIdOf(raw.site, raw.siteListingId);
      const existing = await readListing<Listing>(id);
      await writeListing(id, {
        ...raw,
        id,
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

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'HYDRATE_REQUEST') {
    void Promise.all([listAllListings<Listing>(), listFavorites()]).then(([listings, favorites]) => {
      sendResponse({ type: 'HYDRATE_RESPONSE', listings, favorites });
    });
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

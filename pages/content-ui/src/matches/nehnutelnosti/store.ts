import { overlayPrefStorage } from '@extension/storage';
import { useSyncExternalStore } from 'react';
import type { GeoPoint, Listing, ListingList, RawListing, RuntimeMessage } from '@extension/shared';

type State = {
  listings: Map<string, Listing>;
  favorites: Set<string>;
  failedIds: Set<string>;
  selectedId: string | null;
  lists: ListingList[];
  activeListId: string;
};

const state: State = {
  listings: new Map(),
  favorites: new Set(),
  failedIds: new Set(),
  selectedId: null,
  lists: [],
  activeListId: '',
};

const computeSnapshot = () => ({
  listings: Array.from(state.listings.values()),
  favorites: new Set(state.favorites),
  failedIds: new Set(state.failedIds),
  selectedId: state.selectedId,
  lists: state.lists.slice(),
  activeListId: state.activeListId,
});

const listeners = new Set<() => void>();
let snapshot = computeSnapshot();

const emit = () => {
  snapshot = computeSnapshot();
  listeners.forEach(l => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const getSnapshot = () => snapshot;

const useOverlayState = () => useSyncExternalStore(subscribe, getSnapshot);

const idOf = (raw: RawListing) => `${raw.site}:${raw.siteListingId}`;

const ingestExtracted = (raws: RawListing[]) => {
  for (const raw of raws) {
    const id = idOf(raw);
    const existing = state.listings.get(id);
    state.listings.set(id, {
      ...raw,
      id,
      listIds: existing?.listIds ?? (state.activeListId ? [state.activeListId] : []),
      coord: existing?.coord,
      expiresAt: existing?.expiresAt ?? Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
  }
  emit();
};

const ingestRemoved = (ids: string[]) => {
  for (const id of ids) state.listings.delete(id);
  if (state.selectedId && ids.includes(state.selectedId)) state.selectedId = null;
  emit();
};

const ingestGeocoded = (id: string, coord: GeoPoint) => {
  state.failedIds.delete(id);
  const existing = state.listings.get(id);
  if (!existing) return;
  state.listings.set(id, { ...existing, coord });
  emit();
};

const ingestFailed = (id: string) => {
  state.failedIds.add(id);
  emit();
};

const select = (id: string | null) => {
  state.selectedId = id;
  emit();
};

const toggleFavorite = (id: string) => {
  const next = !state.favorites.has(id);
  if (next) state.favorites.add(id);
  else state.favorites.delete(id);
  emit();
  void chrome.runtime.sendMessage({ type: 'TOGGLE_FAVORITE', id, isFavorite: next });
};

const checkFavorite = (id: string) => state.favorites.has(id);

// Pull listings + favorites + lists from the background-owned IndexedDB.
// Content scripts have a different IDB origin (host page's) than the
// background (extension's), so this must be a message round-trip.
const hydrateFromBackground = async () => {
  try {
    const resp = (await chrome.runtime.sendMessage({ type: 'HYDRATE_REQUEST' })) as
      | {
          type: 'HYDRATE_RESPONSE';
          listings: Listing[];
          favorites: string[];
          lists: ListingList[];
          activeListId: string;
        }
      | undefined;
    if (!resp) return;
    state.listings.clear();
    for (const listing of resp.listings) state.listings.set(listing.id, listing);
    state.favorites = new Set(resp.favorites);
    state.lists = resp.lists;
    state.activeListId = resp.activeListId;
    emit();
  } catch (err) {
    console.warn('[mapa-nehnutelnosti] hydrate failed', err);
  }
};

const setActiveList = async (id: string) => {
  const pref = await overlayPrefStorage.get();
  // Auto-pause indexing on every list switch so the user must explicitly
  // opt in before new searches start populating the newly active list.
  await overlayPrefStorage.set({ ...pref, activeListId: id, indexingEnabled: false });
  state.activeListId = id;
  state.listings.clear();
  emit();
  await hydrateFromBackground();
};

const createList = async (name: string): Promise<ListingList | null> => {
  const resp = (await chrome.runtime.sendMessage({ type: 'CREATE_LIST', name })) as
    | { type: 'CREATE_LIST_RESPONSE'; list: ListingList }
    | undefined;
  if (!resp?.list) return null;
  state.lists = [...state.lists, resp.list];
  emit();
  return resp.list;
};

const renameList = async (id: string, name: string) => {
  await chrome.runtime.sendMessage({ type: 'RENAME_LIST', id, name });
  state.lists = state.lists.map(l => (l.id === id ? { ...l, name } : l));
  emit();
};

const deleteList = async (id: string) => {
  await chrome.runtime.sendMessage({ type: 'DELETE_LIST', id });
  state.lists = state.lists.filter(l => l.id !== id);
  emit();
  // Background may have reassigned activeListId; refresh to be safe.
  await hydrateFromBackground();
};

const downloadListCsv = async (id: string) => {
  const resp = (await chrome.runtime.sendMessage({ type: 'EXPORT_LIST_CSV', id })) as
    | { type: 'EXPORT_LIST_CSV_RESPONSE'; csv: string; name: string }
    | undefined;
  if (!resp) return;
  const url = URL.createObjectURL(new Blob([resp.csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = resp.name;
  a.click();
  URL.revokeObjectURL(url);
};

const importListCsv = async (
  name: string,
  csv: string,
): Promise<{ list: ListingList; imported: number; skipped: number } | null> => {
  const resp = (await chrome.runtime.sendMessage({ type: 'IMPORT_LIST_CSV', name, csv })) as
    | { type: 'IMPORT_LIST_CSV_RESPONSE'; list: ListingList; imported: number; skipped: number }
    | undefined;
  if (!resp) return null;
  state.lists = [...state.lists, resp.list];
  emit();
  return { list: resp.list, imported: resp.imported, skipped: resp.skipped };
};

const handleRuntimeMessage = (msg: RuntimeMessage) => {
  switch (msg.type) {
    case 'LISTINGS_EXTRACTED':
      ingestExtracted(msg.listings);
      break;
    case 'LISTINGS_REMOVED':
      ingestRemoved(msg.ids);
      break;
    case 'LISTING_GEOCODED':
      ingestGeocoded(msg.id, msg.coord);
      break;
    case 'GEOCODE_FAILED':
      ingestFailed(msg.id);
      break;
  }
};

// Register at module load to close the race window where background broadcasts
// LISTINGS_EXTRACTED before React mounts and registers the listener via useEffect.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    handleRuntimeMessage(msg);
  });
}

export {
  subscribe,
  getSnapshot,
  useOverlayState,
  ingestExtracted,
  ingestRemoved,
  ingestGeocoded,
  ingestFailed,
  select,
  toggleFavorite,
  checkFavorite,
  hydrateFromBackground,
  handleRuntimeMessage,
  setActiveList,
  createList,
  renameList,
  deleteList,
  downloadListCsv,
  importListCsv,
};

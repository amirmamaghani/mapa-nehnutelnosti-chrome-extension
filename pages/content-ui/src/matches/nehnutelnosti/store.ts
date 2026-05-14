import { useSyncExternalStore } from 'react';
import type { GeoPoint, Listing, RawListing, RuntimeMessage } from '@extension/shared';

type State = {
  listings: Map<string, Listing>;
  favorites: Set<string>;
  failedIds: Set<string>;
  selectedId: string | null;
};

const state: State = {
  listings: new Map(),
  favorites: new Set(),
  failedIds: new Set(),
  selectedId: null,
};

const computeSnapshot = () => ({
  listings: Array.from(state.listings.values()),
  favorites: new Set(state.favorites),
  failedIds: new Set(state.failedIds),
  selectedId: state.selectedId,
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

// Pull listings + favorites from the background-owned IndexedDB. Content
// scripts have a different IDB origin (host page's) than the background
// (extension's), so this must be a message round-trip.
const hydrateFromBackground = async () => {
  try {
    const resp = (await chrome.runtime.sendMessage({ type: 'HYDRATE_REQUEST' })) as
      | { type: 'HYDRATE_RESPONSE'; listings: Listing[]; favorites: string[] }
      | undefined;
    if (!resp) return;
    for (const listing of resp.listings) {
      const existing = state.listings.get(listing.id);
      state.listings.set(listing.id, { ...listing, coord: existing?.coord ?? listing.coord });
    }
    state.favorites = new Set(resp.favorites);
    emit();
  } catch (err) {
    console.warn('[mapa-nehnutelnosti] hydrate failed', err);
  }
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
};

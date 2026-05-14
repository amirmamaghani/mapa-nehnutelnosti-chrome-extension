import { createStore, del, get as idbGet, keys as idbKeys, set as idbSet } from 'idb-keyval';

// idb-keyval's createStore(dbName, storeName) creates a database with that
// single store on first open; calling it multiple times with the same
// dbName but different storeNames does NOT add stores. Use a dedicated
// database per store to keep things simple.
const geocodesStore = createStore('mapa-nehnutelnosti-geocodes', 'geocodes');
const listingsStore = createStore('mapa-nehnutelnosti-listings', 'listings');
const favoritesStore = createStore('mapa-nehnutelnosti-favorites', 'favorites');
const listsStore = createStore('mapa-nehnutelnosti-lists', 'lists');

type GeocodeHit = { lat: number; lng: number; expiresAt: number };
type GeocodeMiss = { miss: true; expiresAt: number };
type GeocodeRecord = GeocodeHit | GeocodeMiss;

const isExpired = (expiresAt: number) => expiresAt < Date.now();

const GEOCODE_HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GEOCODE_MISS_TTL_MS = 24 * 60 * 60 * 1000;
const LISTING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const readGeocode = async (key: string): Promise<GeocodeRecord | undefined> => {
  const v = await idbGet<GeocodeRecord>(key, geocodesStore);
  if (!v) return undefined;
  if (isExpired(v.expiresAt)) {
    await del(key, geocodesStore);
    return undefined;
  }
  return v;
};

const writeGeocode = (key: string, value: GeocodeRecord): Promise<void> => idbSet(key, value, geocodesStore);

const readListing = async <T extends { expiresAt: number }>(id: string): Promise<T | undefined> => {
  const v = await idbGet<T>(id, listingsStore);
  if (!v) return undefined;
  if (isExpired(v.expiresAt)) {
    await del(id, listingsStore);
    return undefined;
  }
  return v;
};

const patchListing = async <T extends { expiresAt: number }>(id: string, patch: Partial<T>): Promise<void> => {
  const existing = await idbGet<T>(id, listingsStore);
  if (!existing) return;
  await idbSet(id, { ...existing, ...patch }, listingsStore);
};

const listAllListings = async <T extends { expiresAt: number; addressRaw?: string }>(): Promise<T[]> => {
  const ks = (await idbKeys(listingsStore)) as string[];
  const values = await Promise.all(ks.map(k => idbGet<T>(k, listingsStore)));
  const out: T[] = [];
  await Promise.all(
    values.map(async (v, i) => {
      if (!v) return;
      if (isExpired(v.expiresAt)) {
        await del(ks[i], listingsStore);
        return;
      }
      out.push(v);
    }),
  );
  return out;
};

const writeListing = <T extends { expiresAt: number }>(id: string, value: T): Promise<void> =>
  idbSet(id, value, listingsStore);

const addFavorite = (id: string): Promise<void> => idbSet(id, true, favoritesStore);
const removeFavorite = (id: string): Promise<void> => del(id, favoritesStore);
const isFavorite = async (id: string): Promise<boolean> => (await idbGet<boolean>(id, favoritesStore)) === true;
const listFavorites = async (): Promise<string[]> => (await idbKeys(favoritesStore)) as string[];

const clearGeocodes = async (): Promise<void> => {
  const ks = (await idbKeys(geocodesStore)) as string[];
  await Promise.all(ks.map(k => del(k, geocodesStore)));
};

const clearListings = async (): Promise<void> => {
  const ks = (await idbKeys(listingsStore)) as string[];
  await Promise.all(ks.map(k => del(k, listingsStore)));
};

// --- lists ---

type ListRecord = { id: string; name: string; createdAt: number };

const readList = (id: string): Promise<ListRecord | undefined> => idbGet<ListRecord>(id, listsStore);

const writeList = (record: ListRecord): Promise<void> => idbSet(record.id, record, listsStore);

const deleteList = (id: string): Promise<void> => del(id, listsStore);

const listAllLists = async (): Promise<ListRecord[]> => {
  const ks = (await idbKeys(listsStore)) as string[];
  const vs = await Promise.all(ks.map(k => idbGet<ListRecord>(k, listsStore)));
  return vs.filter((v): v is ListRecord => !!v).sort((a, b) => a.createdAt - b.createdAt);
};

// Cascade: drop the listId from every listing's listIds. Listings with no
// remaining membership are deleted entirely.
const cascadeRemoveListIdFromListings = async <T extends { id: string; expiresAt: number; listIds: string[] }>(
  listId: string,
): Promise<void> => {
  const all = await listAllListings<T>();
  await Promise.all(
    all.map(async listing => {
      if (!listing.listIds.includes(listId)) return;
      const remaining = listing.listIds.filter(id => id !== listId);
      if (remaining.length === 0) {
        await del(listing.id, listingsStore);
      } else {
        await idbSet(listing.id, { ...listing, listIds: remaining }, listingsStore);
      }
    }),
  );
};

const normalizeAddress = (raw: string): string => raw.trim().toLowerCase().replace(/\s+/g, ' ');

export {
  geocodesStore,
  listingsStore,
  favoritesStore,
  listsStore,
  readGeocode,
  writeGeocode,
  readListing,
  patchListing,
  listAllListings,
  writeListing,
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavorites,
  clearGeocodes,
  clearListings,
  readList,
  writeList,
  deleteList,
  listAllLists,
  cascadeRemoveListIdFromListings,
  normalizeAddress,
  GEOCODE_HIT_TTL_MS,
  GEOCODE_MISS_TTL_MS,
  LISTING_TTL_MS,
};
export type { GeocodeHit, GeocodeMiss, GeocodeRecord, ListRecord };

import type { GeoPoint, Listing, ListingList, RawListing } from './listing.js';

export type RuntimeMessage =
  | { type: 'LISTINGS_EXTRACTED'; listings: RawListing[] }
  | { type: 'LISTINGS_REMOVED'; ids: string[] }
  | { type: 'LISTING_GEOCODED'; id: string; coord: GeoPoint }
  | { type: 'GEOCODE_FAILED'; id: string }
  | { type: 'HYDRATE_REQUEST' }
  | {
      type: 'HYDRATE_RESPONSE';
      listings: Listing[];
      favorites: string[];
      lists: ListingList[];
      activeListId: string;
    }
  | { type: 'TOGGLE_FAVORITE'; id: string; isFavorite: boolean }
  | { type: 'CLEAR_CACHE' }
  | { type: 'CREATE_LIST'; name: string }
  | { type: 'CREATE_LIST_RESPONSE'; list: ListingList }
  | { type: 'RENAME_LIST'; id: string; name: string }
  | { type: 'DELETE_LIST'; id: string }
  | { type: 'EXPORT_LIST_CSV'; id: string }
  | { type: 'EXPORT_LIST_CSV_RESPONSE'; csv: string; name: string };

export type PageMessage = { type: 'HIGHLIGHT_LISTING'; site: string; siteListingId: string };

export const PAGE_MESSAGE_NAMESPACE = 'mapa-nehnutelnosti';

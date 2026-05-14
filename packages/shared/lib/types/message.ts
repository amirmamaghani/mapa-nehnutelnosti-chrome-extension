import type { GeoPoint, Listing, RawListing } from './listing.js';

export type RuntimeMessage =
  | { type: 'LISTINGS_EXTRACTED'; listings: RawListing[] }
  | { type: 'LISTINGS_REMOVED'; ids: string[] }
  | { type: 'LISTING_GEOCODED'; id: string; coord: GeoPoint }
  | { type: 'GEOCODE_FAILED'; id: string }
  | { type: 'HYDRATE_REQUEST' }
  | { type: 'HYDRATE_RESPONSE'; listings: Listing[]; favorites: string[] }
  | { type: 'TOGGLE_FAVORITE'; id: string; isFavorite: boolean }
  | { type: 'CLEAR_CACHE' };

export type PageMessage = { type: 'HIGHLIGHT_LISTING'; site: string; siteListingId: string };

export const PAGE_MESSAGE_NAMESPACE = 'mapa-nehnutelnosti';

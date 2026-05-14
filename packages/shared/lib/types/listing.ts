export type SiteId = 'nehnutelnosti' | 'reality' | 'topreality' | 'bazos';

export type PageType = 'list' | 'detail' | 'unknown';

export type GeoPoint = { lat: number; lng: number };

export type RawListing = {
  siteListingId: string;
  url: string;
  site: SiteId;
  title: string;
  addressRaw: string;
  thumbnailUrl?: string;
  priceEur?: number;
  areaSqm?: number;
};

export type Listing = RawListing & {
  id: string;
  /** Listing belongs to one or more user-defined lists. */
  listIds: string[];
  coord?: GeoPoint;
  expiresAt: number;
};

export type ListingList = {
  id: string;
  name: string;
  createdAt: number;
};

export const listingIdOf = (site: SiteId, siteListingId: string): string => `${site}:${siteListingId}`;

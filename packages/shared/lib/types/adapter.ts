import type { PageType, RawListing, SiteId } from './listing.js';

export interface SiteAdapter {
  readonly site: SiteId;
  matches(url: URL): boolean;
  detectPageType(doc: Document): PageType;
  extractListings(doc: Document): RawListing[];
  findListingNode(doc: Document, siteListingId: string): HTMLElement | null;
  getObservationRoot(doc: Document): HTMLElement | null;
}

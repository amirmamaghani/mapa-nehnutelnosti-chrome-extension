# 03 — Listing extraction

## Goals

- Extract a stable `RawListing` record from the page DOM with **per-site
  adapters**.
- Survive small DOM changes via a **layered extraction strategy** (structured
  field → composed fields → regex sweep).
- Detect new cards added by infinite scroll or pagination via
  `MutationObserver` and re-extract incrementally.

## v1 scope

v1 ships exactly one adapter: **`nehnutelnosti.ts`**. The adapter interface,
schema, registry, and fixtures pattern are defined for multi-portal use so
later adapters (reality.sk, topreality.sk; bazos.sk/reality in v1.1) plug in
without core changes.

## Listing schema

Defined in `packages/shared/src/types/listing.ts`.

```ts
type SiteId = 'nehnutelnosti' | 'reality' | 'topreality' | 'bazos';
type PageType = 'list' | 'detail' | 'unknown';

type RawListing = {
  siteListingId: string;   // stable per-site id (URL path or data attr)
  url: string;             // absolute detail URL
  site: SiteId;
  title: string;
  addressRaw: string;
  thumbnailUrl?: string;
  priceEur?: number;       // parsed; raw text is not kept
  areaSqm?: number;
};

type Listing = RawListing & {
  id: string;              // `${site}:${siteListingId}`
  coord?: { lat: number; lng: number };
  expiresAt: number;
};
```

`id` is the canonical key for every cache, message, and UI element.

## Adapter interface

```ts
interface SiteAdapter {
  readonly site: SiteId;
  matches(url: URL): boolean;
  detectPageType(doc: Document): PageType;
  extractListings(doc: Document): RawListing[];
  findListingNode(doc: Document, siteListingId: string): HTMLElement | null;
  /** Root to observe for infinite-scroll/pagination DOM changes. */
  getObservationRoot(doc: Document): HTMLElement | null;
}
```

Adapters live in `packages/shared/src/adapters/<site>.ts`. The content script
picks the first adapter whose `matches(url)` returns true. For v1, the
registry contains only `nehnutelnosti.ts`.

### Authoring rules

- Avoid hashed/auto-generated class names. Prefer `data-*`, ARIA, headings,
  link hrefs.
- One selector per field. If it returns nothing, the field is `undefined` —
  no candidate-selector ladder inside `extractListings`. The composed and
  regex layers below handle the address; other fields just go missing
  gracefully.
- In dev mode, the content script logs a warning when `extractListings`
  returns 0 items on a `list` page. That's the breakage signal.

## Page-type detection

`detectPageType` returns `list` | `detail` | `unknown` based on URL pattern
and a small set of DOM markers. O(1) — no full-document traversal.
`unknown` disables extraction; the overlay does not mount.

## Address extraction (three layers)

Applied in order until one returns a non-empty string. The result is
assigned to `addressRaw`.

1. **Structured DOM field.** A single selector targeting the location
   element (breadcrumb, `.location` span, `og:` meta, …).
2. **Composed fields.** If location is split across `street`, `city`,
   `district`, concatenate as `"street, city, district, SK"`.
3. **Regex sweep** over the card's `textContent`:
   - SK street + number: `/\b[A-ZÁČĎÉÍĽĹŇÓŔŠŤÚÝŽ][\p{L}\.\-\s]{2,40}\s+\d+[a-zA-Z]?\b/u`
   - SK postal code: `/\b\d{3}\s?\d{2}\b/`
   - SK town allowlist (~3000 entries) shipped as a static JSON in the
     adapter package.

If all three fail, the listing is extracted without an address and is **not**
sent to the geocoder. It is still cached so favorites and the listings list
remain consistent.

## Mutation observer

The content script wires one `MutationObserver` on the root returned by the
adapter. The callback is debounced (200 ms) and:

1. Re-runs `extractListings(doc)` to get the current set.
2. Diffs against the previous set by `siteListingId`.
3. Sends `LISTINGS_EXTRACTED` for new ids; emits `LISTINGS_REMOVED` for ids
   no longer in the DOM (pins disappear; cached records remain).

One code path. No partial-subtree extraction variant.

On classic pagination (full page reload), extraction simply runs again on
load; cache hides the cost.

## Detail pages

The single listing on a detail page is extracted when the user is viewing
it directly. The extension does **not** initiate background fetches of
detail pages to enrich previews shown elsewhere. Preview cards on the map
use only the data the listing card already exposes.

## Breakage detection

- Each adapter ships ≥ 1 HTML fixture per page type under `__fixtures__/`.
  Unit tests assert extraction yields the expected `RawListing[]`.
- The dev-mode "0 listings on a list page" console warning is the runtime
  signal. No telemetry, no diagnostics view, no `__version` string.

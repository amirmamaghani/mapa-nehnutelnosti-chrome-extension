# Specs — Mapa Nehnuteľností

Chrome extension that adds an interactive map overlay to Slovak real-estate
portals. The extension reads listings from the page DOM, geocodes their
addresses against OpenStreetMap, and plots them on a draggable map overlay
the user can expand or collapse.

**v1 scope:** nehnuteľnosti.sk only. The architecture is multi-portal from
day one (adapter registry), but only the nehnuteľnosti.sk adapter ships.
Other portals — reality.sk, topreality.sk, bazos.sk/reality — are scheduled
for later versions (see [01-product.md](01-product.md)).

These specs are normative for v1. Documentation language is English even
though the product UI is Slovak.

## Index

1. [Product](01-product.md) — problem, users, goals, non-goals, supported sites
2. [Architecture](02-architecture.md) — module layout, data flow, messaging
3. [Listing extraction](03-listing-extraction.md) — adapter interface, schema, page-type detection
4. [Geocoding & cache](04-geocoding-and-cache.md) — Nominatim policy, IndexedDB layout, TTLs
5. [UI](05-ui.md) — overlay, map, pins, favorites, filters
6. [Permissions & privacy](06-permissions-and-privacy.md) — manifest hosts, attribution, data handling

## Tech baseline

- Boilerplate: `chrome-extension-boilerplate-react-vite` (pnpm + Turborepo + Vite + React + TS)
- Map: **Leaflet** with **OpenStreetMap** tiles
- Geocoder: **Nominatim** (OSM, public endpoint, rate-limited to 1 req/sec)
- Address extraction: **per-site DOM adapter** with structured-field, composed, and regex-sweep layers
- Cache: **IndexedDB via `idb-keyval`**
- UI surface: **a single injected page overlay** in `pages/content-ui`

## Out of scope for v1

- **Portals other than nehnuteľnosti.sk.** reality.sk + topreality.sk land
  in a follow-up; bazos.sk/reality is v1.1.
- **Detail-page enrichment.** Previews use only what the listing card
  contains; we never fetch the listing detail page for extra data.
- **Side panel, toolbar popup, options page.** All settings live inside
  the overlay. Boilerplate pages (`pages/side-panel`, `pages/popup`,
  `pages/options`, `pages/devtools`, etc.) are not built into v1.
- No backend service, no telemetry, no account system.
- No paid map provider (Google/Mapbox).
- No cross-portal deduplication.
- No mobile browser support.

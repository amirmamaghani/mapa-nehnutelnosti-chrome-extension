# 01 — Product

## Problem

Slovak real-estate portals present listings as text-and-thumbnail cards.
Location is shown only as a city/district label; a map view, when offered at
all, is per-listing and hidden behind extra clicks. A buyer scanning ten or
fifty listings cannot see at a glance which ones cluster in the neighborhood
they actually care about.

v1 targets **nehnuteľnosti.sk** — Slovakia's largest real-estate portal and
the one with the most structured DOM, which means the highest-quality first
release at the lowest implementation risk.

## Solution

A browser extension that augments the portal with an interactive map view.
The extension reads listings already on the page, geocodes their addresses
locally, and plots them on an OpenStreetMap-based overlay. Clicking a pin
shows a preview card built from the same data the card already exposes;
clicking the preview scrolls to the listing on the page.

## Target users

- Buyers and renters comparing many listings on nehnuteľnosti.sk.
- Power users who keep dozens of tabs open and want spatial context without
  switching to a separate map tool.
- Users who care about privacy: all extraction, geocoding, and caching happens
  client-side, with no account or backend.

## Goals (v1)

1. Extract listings from **nehnuteľnosti.sk** on **list (search-result)
   pages** and **detail pages**.
2. Geocode each listing's address via Nominatim and plot it on a Leaflet map.
3. Render the map as a **single injected overlay** on the page, expandable
   to a chip in the bottom-right corner.
4. On a list page, geocode **all listings currently in the DOM** and **continue
   geocoding** as the user scrolls (infinite scroll / pagination both
   supported).
5. Clicking a pin opens a Leaflet popup with a preview card built **only from
   data visible on the listing card**; the preview offers a "scroll to
   listing" action that highlights the corresponding card on the page.
6. **Favorites**: starring a listing persists it across sessions and surfaces
   it with a distinct marker.
7. **Map filters**: client-side filtering of plotted pins by price and area.
8. **Cache** geocoded coordinates and parsed listings in IndexedDB to minimize
   Nominatim load and survive page reloads.

## Non-goals (v1)

- **Portals other than nehnuteľnosti.sk.** Architecture supports more, but no
  other adapter ships in v1.
- **Detail-page enrichment.** We never fetch the listing detail page to
  enrich the preview; previews reuse only the data the listing card already
  exposes. (If a detail page is what the user is *currently viewing*, the
  single listing on that page is extracted normally — but the extension
  does not initiate any extra navigation or background fetches.)
- **Side panel, toolbar popup, options page.** Settings live inside the
  overlay. Reduces v1 to one UI surface.
- No backend service. No accounts. No remote storage.
- No telemetry or analytics.
- No paid map or geocoding provider.
- No cross-portal deduplication.
- No saved-search or alert features.
- No mobile browser support.
- No AI-assisted extraction; pure DOM + regex.

## Supported sites

| Site                 | Version  | Notes                                                    |
| -------------------- | -------- | -------------------------------------------------------- |
| nehnuteľnosti.sk     | **v1**   | Primary and only v1 target. Largest SK portal, most structured DOM. |
| reality.sk           | post-v1  | Second-largest SK portal. Adapter to be written.         |
| topreality.sk        | post-v1  | Third major SK portal. Adapter to be written.            |
| bazos.sk/reality     | **v1.1** | Classifieds; least structured DOM. Explicitly deferred to v1.1 because its extraction is the highest risk. |

The architecture is multi-portal from the start (see [02-architecture.md](02-architecture.md)
and the `SiteAdapter` interface in [03-listing-extraction.md](03-listing-extraction.md)).
Adding a portal in a later version means writing a new adapter and registering
it; no core changes required.

## Success criteria

- On a fresh nehnuteľnosti.sk search result page, ≥ 90% of visible listings
  appear as map pins within 60 seconds of the page settling.
- Geocoded addresses cached across reloads — a return visit to the same search
  in < 30 days re-uses cache and avoids new Nominatim requests for known
  addresses.
- Overlay is collapsible to a chip; open/collapsed state persists globally.
- Extension respects Nominatim's 1 req/sec limit at all times.

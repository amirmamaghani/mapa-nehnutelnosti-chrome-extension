# 02 — Architecture

## Overview

Three runtime contexts and a set of shared packages. Communication via
`chrome.runtime` messaging; persistent state in IndexedDB and
`chrome.storage.local`.

```
┌─── Page (nehnutelnosti.sk) ─────────────────────────────────┐
│  ┌─ content script ─┐   ┌─ content-ui (React, Shadow DOM) ─┐│
│  │  • site adapter  │←→ │  • map overlay                    ││
│  │  • DOM observer  │   │  • preview cards                  ││
│  │  • highlight()   │   │  • settings panel                 ││
│  └────────┬─────────┘   │  • favorites + filters            ││
│           │             └──────────────┬────────────────────┘│
└───────────┼────────────────────────────┼─────────────────────┘
            │ chrome.runtime messages    │
            ▼                            ▼
        ┌─── background (service worker) ─────────────────────┐
        │  • Nominatim queue (1 req/sec)                      │
        │  • IndexedDB writes (geocodes, listings)            │
        └─────────────────────────────────────────────────────┘
```

No side panel. No toolbar popup. No options page. Settings live inside the
overlay's settings panel.

## Module → boilerplate mapping

| Concern                       | Boilerplate location              | Notes                                                  |
| ----------------------------- | --------------------------------- | ------------------------------------------------------ |
| Content script (extraction)   | `pages/content`                   | Runs the adapter, observes DOM, sends listings to bg.  |
| Injected React overlay        | `pages/content-ui`                | Map + previews + settings, rendered in shadow DOM.     |
| Background service worker     | `chrome-extension/src/background` | Nominatim queue, IndexedDB writes.                     |
| Site adapters                 | `packages/shared/src/adapters/*`  | v1 ships only `nehnutelnosti.ts`.                      |
| Listing & geocode cache       | `packages/storage` (extended)     | `idb-keyval` stores; schema in [04](04-geocoding-and-cache.md). |
| Shared types & utilities      | `packages/shared`                 | `Listing`, `SiteId`, `PageType`, `MessageEnvelope`.    |
| i18n (sk + en)                | `packages/i18n`                   | UI strings; Slovak default, English available.         |

The boilerplate's `pages/popup`, `pages/options`, `pages/side-panel`,
`pages/devtools`, etc. are **not built** for the v1 extension. Leave the
directories or delete them — they do not appear in `chrome-extension/manifest.ts`.

## Context responsibilities

### Content script (`pages/content`)

- Selects the adapter via `location.hostname`.
- Classifies the page (`list` / `detail` / `unknown`).
- Iterates listing cards (or the single detail listing); emits
  `RawListing[]` to the background.
- Observes DOM for new/removed cards (debounced; see
  [03-listing-extraction.md](03-listing-extraction.md)).
- Exposes `highlightListing(id)`: scrolls the listing's node into view and
  applies an outline class for 2 s. Called by content-ui via
  `window.postMessage` (same tab, same process — no need to involve the
  background).

### Content UI (`pages/content-ui`)

- Mounts the React overlay inside a shadow root injected by the content
  script (host-page CSS isolated).
- Subscribes to listing/geocode events from the background.
- Reads and writes `favorites` directly to IndexedDB — no message needed.
- Reads/writes prefs (collapsed state, theme override if any) directly to
  `chrome.storage.local`.
- Posts `HIGHLIGHT_LISTING` to the content script via `window.postMessage`.

### Background (`chrome-extension/src/background`)

- Owns the **Nominatim request queue** (single-flight, 1 req/sec; see
  [04](04-geocoding-and-cache.md)).
- Owns `geocodes` and `listings` IndexedDB writes (single writer).
- Routes geocode-result broadcasts to the originating tab's content-ui.

## Data flow

1. Page loads → content script picks adapter → extracts `RawListing[]`.
2. Content script sends `LISTINGS_EXTRACTED` to background.
3. Background normalizes to `Listing[]`, writes to `listings`.
4. For each listing whose address is not cached in `geocodes`, background
   enqueues a Nominatim request.
5. As geocodes resolve, background writes to `geocodes` and broadcasts
   `LISTING_GEOCODED` to the tab's content-ui.
6. Overlay adds the pin to the map.
7. User clicks a pin → preview shown in the Leaflet popup; "scroll to
   listing" → `window.postMessage({ type: 'HIGHLIGHT_LISTING', id })` →
   content script highlights.
8. User stars a listing → content-ui writes to `favorites` directly.

## Message contracts

`packages/shared`:

```ts
type MessageEnvelope =
  | { type: 'LISTINGS_EXTRACTED'; listings: RawListing[] }
  | { type: 'LISTINGS_REMOVED';   ids: string[] }
  | { type: 'LISTING_GEOCODED';   id: string; coord: { lat: number; lng: number } }
  | { type: 'GEOCODE_FAILED';     id: string };
```

That's it for `chrome.runtime`. `HIGHLIGHT_LISTING` is intra-tab via
`window.postMessage` and is not part of this envelope. Favorites + prefs
are direct storage writes — no message.

`tabId` is not on the envelope because `chrome.runtime` already exposes
`sender.tab.id`; broadcasting back uses `chrome.tabs.sendMessage(senderTab,…)`.

## Concurrency

- Service worker is single-threaded; the Nominatim queue is a FIFO with a
  1-second minimum spacing.
- IndexedDB writes from background are awaited.
- Multiple tabs may extract overlapping addresses; the geocode cache dedupes.

## Testing posture

- **Adapter unit tests** with HTML fixtures (v1: nehnuteľnosti.sk only) in
  `packages/shared/src/adapters/__fixtures__/*.html`. Run in jsdom.
- **Queue unit tests** with a fake `fetch` and a fake clock.
- No live-network tests in CI. Manual smoke before release; results noted
  in commit messages of release PRs.

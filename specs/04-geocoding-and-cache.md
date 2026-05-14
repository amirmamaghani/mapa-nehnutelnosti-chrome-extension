# 04 — Geocoding & cache

## Geocoder

**Provider:** Nominatim, public endpoint `https://nominatim.openstreetmap.org`.

The Nominatim usage policy
(https://operations.osmfoundation.org/policies/nominatim/) is **binding** for
v1. The extension MUST:

- Send a meaningful `User-Agent`: `Mapa-Nehnutelnosti/<version> (<repo-url>)`.
- Cap traffic at **≤ 1 request/second** globally across all tabs.
- Send no more than one parallel request at a time (queue serializes).
- Cache results and never re-request an address still within TTL.
- Provide attribution in the UI (see [06-permissions-and-privacy.md](06-permissions-and-privacy.md)).

### Request format

```
GET /search
  ?q=<urlencoded address>
  &format=jsonv2
  &countrycodes=sk
  &limit=1
  &accept-language=sk
```

`countrycodes=sk` improves accuracy and reduces load. We don't need
`addressdetails` — only `lat`/`lon` are consumed.

### Response handling

- Empty array → cache a negative result (TTL 24h) so we don't re-ask.
- HTTP 429 / 5xx → **pause the queue for 30 seconds**, then resume. No
  exponential ladder; no banner state machine. If the queue trips its pause
  three times in a row, surface a single non-blocking banner: "Map paused;
  retry later." That banner clears on the next successful response.
- Success → cache `{ lat, lng, expiresAt }`.

## Request queue

Lives in the background service worker. Single-flight, ≥ 1 s between
dispatches.

```
enqueue(address):
  hit = cache.get(normalize(address))
  if hit and not expired: return hit
  if in-flight set has key:  return existing promise
  push to queue, return new promise

dispatch loop:
  while queue not empty:
    item = queue.shift()
    await sleepUntil(lastDispatch + 1000 ms)
    res  = await fetch(...)
    lastDispatch = now()
    resolve / reject + cache.set
```

Normalization key: `addressRaw.trim().toLowerCase().replace(/\s+/g, ' ')`.
Identical normalized addresses on the same page resolve from a single
request.

## IndexedDB layout

`idb-keyval` with three named stores. All writes happen from the background
worker; reads happen from any context.

```
DB:  mapa-nehnutelnosti
stores:
  geocodes:    key = normalized address
               value = { lat: number; lng: number; expiresAt: number } | { miss: true; expiresAt: number }
  listings:    key = Listing.id
               value = Listing (see 03-listing-extraction.md)
  favorites:   key = Listing.id
               value = true        // presence is the flag
```

Preferences live in `chrome.storage.local` (small, infrequent, sync-ish reads
from the content script). No separate `prefs` IDB store.

## TTL & purge

| Store              | TTL       | Notes                                      |
| ------------------ | --------- | ------------------------------------------ |
| geocodes (hit)     | 30 days   | Coordinates of physical addresses are stable. |
| geocodes (miss)    | 24 hours  | Retry tomorrow.                            |
| listings           | 7 days    | Listings turn over.                        |
| favorites          | ∞         | User-curated.                              |

**Purge is lazy.** On read, if `expiresAt < now()`, delete the entry and
treat as a miss. No `chrome.alarms` job, no daily sweep, no startup job.
IndexedDB quota on Chrome dwarfs any realistic v1 working set.

## Cache controls

The overlay's settings panel (see [05-ui.md](05-ui.md)) exposes one
destructive action: **Clear cache** — drops `geocodes` and `listings`.
Favorites are preserved.

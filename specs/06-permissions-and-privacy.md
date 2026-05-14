# 06 — Permissions & privacy

## Manifest v3 permissions

```jsonc
{
  "manifest_version": 3,
  "permissions": [
    "storage"
  ],
  "host_permissions": [
    "https://*.nehnutelnosti.sk/*",
    "https://nominatim.openstreetmap.org/*",
    "https://tile.openstreetmap.org/*"
  ]
}
```

Rationale:

- `storage` — `chrome.storage.local` for the single open/collapsed pref.
  (IndexedDB does not need a permission.)
- Host permissions split between **portal hosts** (content-script injection
  and DOM access) and **tile + geocoder hosts** (network). v1 lists only
  `*.nehnutelnosti.sk`; additional portal hosts are added per-version as
  their adapters ship.

### Explicitly NOT requested

- `sidePanel`, `tabs`, `alarms`, `webRequest`, `cookies`, `<all_urls>`.
- No side panel, no scheduled alarms, no request interception, no cookie
  access, no broad-host access.

## Network targets

- `https://nominatim.openstreetmap.org/search` — geocoding.
- `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — tiles, loaded inside
  the content-ui shadow root.
- Thumbnails already requested by the portal page — preview cards reuse
  those URLs and add no new cross-origin requests.

No analytics, no error reporting, no telemetry.

## Nominatim usage policy compliance

Per [04-geocoding-and-cache.md](04-geocoding-and-cache.md):

- `User-Agent: Mapa-Nehnutelnosti/<version> (<repo-url>)`.
- ≤ 1 request/second globally, one concurrent request.
- Cache hits 30 days, misses 24 hours.
- Attribution visible in the UI.

## Attribution

Leaflet attribution control is always visible:

> © OpenStreetMap contributors · Geocoding by Nominatim

The overlay settings panel also lists the same line with links to
`openstreetmap.org/copyright` and the Nominatim policy.

## Data handling

- **All extension data is local.** IndexedDB (`geocodes`, `listings`,
  `favorites`) + one key in `chrome.storage.local`. Nothing leaves the
  browser except address strings sent to Nominatim for the explicit purpose
  of geocoding.
- **No identifiers** are generated, stored, or transmitted.
- **No third-party scripts** are bundled or loaded at runtime.
- **Clearing data:** the overlay's settings panel offers **Clear cache**
  (drops geocodes + listings; favorites preserved). Uninstalling the
  extension drops everything via Chrome's standard behavior.

## Content Security Policy

The extension's content-ui shadow root sets:

```
default-src 'self';
img-src    'self' data: https://tile.openstreetmap.org https://*.nehnutelnosti.sk;
connect-src 'self' https://nominatim.openstreetmap.org https://tile.openstreetmap.org;
style-src  'self' 'unsafe-inline';   /* required by Leaflet markers + Tailwind in dev */
script-src 'self';
```

No inline scripts.

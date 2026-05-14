import { divIcon, latLngBounds, map as createMap, marker as createMarker, tileLayer } from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import type { Listing } from '@extension/shared';
import type { MarkerLabel } from '@extension/storage';
import type { DivIcon, LatLngTuple, Map as LeafletMap, Marker } from 'leaflet';

type Props = {
  listings: Listing[];
  favorites: Set<string>;
  selectedId: string | null;
  markerLabel: MarkerLabel;
  /** When non-null, markers not in this set render dimmed. */
  dimmedIds?: Set<string> | null;
  onSelect: (id: string) => void;
};

const SK_CENTER: LatLngTuple = [48.7, 19.7];
const SK_ZOOM = 8;

const dotIcon = divIcon({
  className: 'mn-pin',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const dotFavIcon = divIcon({
  className: 'mn-pin-fav',
  html: '<div style="width:18px;height:18px;color:#eab308;text-shadow:0 1px 2px rgba(0,0,0,.4);font-size:18px;line-height:18px">★</div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const formatLabel = (listing: Listing, label: MarkerLabel): string => {
  if (label === 'price' && listing.priceEur != null) {
    return listing.priceEur >= 1000 ? `${Math.round(listing.priceEur / 1000)}k €` : `${listing.priceEur} €`;
  }
  if (label === 'title' && listing.title)
    return listing.title.length > 28 ? `${listing.title.slice(0, 28)}…` : listing.title;
  if (label === 'area' && listing.areaSqm != null) return `${listing.areaSqm} m²`;
  return '';
};

const labelIconCache = new Map<string, DivIcon>();

const CHAR_WIDTH = 6.5;
const PADDING_X = 6;
const BORDER = 2;
const HEIGHT = 20;

const getIcon = (listing: Listing, label: MarkerLabel, isFav: boolean): DivIcon => {
  const text = label === 'none' ? '' : formatLabel(listing, label);
  if (!text) return isFav ? dotFavIcon : dotIcon;

  const key = `${isFav ? 'f' : 'n'}|${text}`;
  const cached = labelIconCache.get(key);
  if (cached) return cached;

  const width = Math.ceil(text.length * CHAR_WIDTH) + PADDING_X * 2 + BORDER * 2;
  const bg = isFav ? '#eab308' : '#2563eb';
  const icon = divIcon({
    className: 'mn-pin-label',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:${bg};color:#fff;border-radius:6px;border:${BORDER}px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);font-size:11px;font-weight:600;white-space:nowrap;line-height:1;box-sizing:border-box">${escapeHtml(text)}</div>`,
    iconSize: [width, HEIGHT],
    iconAnchor: [width / 2, HEIGHT / 2],
  });
  labelIconCache.set(key, icon);
  return icon;
};

export const MapView = ({ listings, favorites, selectedId, markerLabel, dimmedIds, onSelect }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const hasFitted = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const markers = markersRef.current;
    const leafletMap = createMap(containerRef.current, {
      center: SK_CENTER,
      zoom: SK_ZOOM,
      attributionControl: true,
      zoomControl: true,
    });
    tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(leafletMap);
    mapRef.current = leafletMap;

    const resizeObserver = new ResizeObserver(() => {
      leafletMap.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      leafletMap.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  const geocoded = useMemo(
    () => listings.filter((l): l is Listing & { coord: NonNullable<Listing['coord']> } => !!l.coord),
    [listings],
  );

  useEffect(() => {
    const leafletMap = mapRef.current;
    if (!leafletMap) return;

    const present = new Set<string>();
    for (const listing of geocoded) {
      present.add(listing.id);
      const existing = markersRef.current.get(listing.id);
      const icon = getIcon(listing, markerLabel, favorites.has(listing.id));
      const isDimmed = dimmedIds != null && !dimmedIds.has(listing.id);
      if (existing) {
        existing.setLatLng([listing.coord.lat, listing.coord.lng]);
        existing.setIcon(icon);
      } else {
        const m = createMarker([listing.coord.lat, listing.coord.lng], { icon }).addTo(leafletMap);
        m.on('click', () => onSelect(listing.id));
        markersRef.current.set(listing.id, m);
      }
      const el = markersRef.current.get(listing.id)?.getElement();
      if (el) el.style.opacity = isDimmed ? '0.2' : '1';
    }
    for (const [id, m] of markersRef.current) {
      if (!present.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }

    if (!hasFitted.current && geocoded.length > 0) {
      const bounds = latLngBounds(geocoded.map(l => [l.coord.lat, l.coord.lng] as LatLngTuple));
      leafletMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      hasFitted.current = true;
    }
  }, [geocoded, favorites, markerLabel, dimmedIds, onSelect]);

  useEffect(() => {
    const leafletMap = mapRef.current;
    if (!leafletMap || !selectedId) return;
    const m = markersRef.current.get(selectedId);
    if (m) {
      leafletMap.panTo(m.getLatLng());
    }
  }, [selectedId]);

  return <div ref={containerRef} className="h-full w-full" />;
};

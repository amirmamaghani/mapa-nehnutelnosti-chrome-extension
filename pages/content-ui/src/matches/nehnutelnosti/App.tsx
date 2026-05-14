import { Filters } from './Filters';
import { MapView } from './Map';
import { Preview } from './Preview';
import { Settings } from './Settings';
import { hydrateFromBackground, select, toggleFavorite, useOverlayState } from './store';
import { t } from '@extension/i18n';
import { useStorage } from '@extension/shared';
import { overlayPrefStorage } from '@extension/storage';
import { useEffect, useMemo, useState } from 'react';
import type { FilterState } from './Filters';
import type { MarkerLabel } from '@extension/storage';

const LABEL_CYCLE: MarkerLabel[] = ['none', 'price', 'title', 'area'];
const LABEL_GLYPH: Record<MarkerLabel, string> = { none: '·', price: '€', title: 'T', area: 'm²' };

export default function App() {
  const overlayPref = useStorage(overlayPrefStorage);
  const { listings, favorites, failedIds, selectedId } = useOverlayState();
  const [filters, setFilters] = useState<FilterState>({ priceMax: null, areaMin: null, areaMax: null });
  const [view, setView] = useState<'map' | 'settings'>('map');

  useEffect(() => {
    void hydrateFromBackground();
  }, []);

  const filtered = useMemo(
    () =>
      listings.filter(l => {
        if (filters.priceMax != null && l.priceEur != null && l.priceEur > filters.priceMax) return false;
        if (filters.areaMin != null && l.areaSqm != null && l.areaSqm < filters.areaMin) return false;
        if (filters.areaMax != null && l.areaSqm != null && l.areaSqm > filters.areaMax) return false;
        return true;
      }),
    [listings, filters],
  );

  const geocodableCount = listings.filter(l => !!l.addressRaw).length;
  const geocodedCount = listings.filter(l => l.coord).length;
  const failedCount = failedIds.size;
  const pendingCount = Math.max(0, geocodableCount - geocodedCount - failedCount);
  const isGeocoding = pendingCount > 0;
  const progressPct = geocodableCount === 0 ? 0 : Math.round(((geocodedCount + failedCount) / geocodableCount) * 100);
  const selected = selectedId ? (listings.find(l => l.id === selectedId) ?? null) : null;

  if (overlayPref.mode === 'collapsed') {
    return (
      <button
        className="fixed bottom-4 right-4 z-[2147483647] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-lg hover:bg-blue-700"
        onClick={() => overlayPrefStorage.set({ ...overlayPref, mode: 'normal' })}
        title={t('expand')}>
        {geocodedCount}
      </button>
    );
  }

  const isMaximized = overlayPref.mode === 'maximized';
  const containerSize = isMaximized ? 'left-4 right-4 h-[50vh]' : 'right-4 h-[360px] w-[480px]';

  return (
    <div
      className={`fixed bottom-4 z-[2147483647] flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-2xl ${containerSize}`}>
      <header className="relative flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold">
        <span className="flex items-center gap-2">
          {t('extensionName')}
          {isGeocoding && (
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"
              title={t('geocodingInProgress', [String(pendingCount)])}
            />
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const next = LABEL_CYCLE[(LABEL_CYCLE.indexOf(overlayPref.markerLabel) + 1) % LABEL_CYCLE.length];
              overlayPrefStorage.set({ ...overlayPref, markerLabel: next });
            }}
            className={`rounded px-1.5 py-1 text-[10px] font-bold hover:bg-gray-200 ${
              overlayPref.markerLabel === 'none' ? 'text-gray-400' : 'text-blue-600'
            }`}
            aria-label="marker-label"
            title={t('markerLabelToggle')}>
            {LABEL_GLYPH[overlayPref.markerLabel]}
          </button>
          <button
            onClick={() => setView(v => (v === 'settings' ? 'map' : 'settings'))}
            className="rounded p-1 text-gray-500 hover:bg-gray-200"
            aria-label="settings">
            ⚙
          </button>
          <button
            onClick={() => overlayPrefStorage.set({ ...overlayPref, mode: isMaximized ? 'normal' : 'maximized' })}
            className="rounded p-1 text-gray-500 hover:bg-gray-200"
            aria-label={isMaximized ? 'restore' : 'maximize'}
            title={isMaximized ? t('restore') : t('maximize')}>
            {isMaximized ? '❐' : '▢'}
          </button>
          <button
            onClick={() => overlayPrefStorage.set({ ...overlayPref, mode: 'collapsed' })}
            className="rounded p-1 text-gray-500 hover:bg-gray-200"
            aria-label="collapse"
            title={t('collapse')}>
            _
          </button>
        </div>
      </header>
      <div className="relative flex-1">
        {view === 'settings' ? (
          <Settings onClose={() => setView('map')} />
        ) : (
          <>
            <MapView
              listings={filtered}
              favorites={favorites}
              selectedId={selectedId}
              markerLabel={overlayPref.markerLabel}
              onSelect={select}
            />
            {selected && (
              <Preview
                listing={selected}
                isFavorite={favorites.has(selected.id)}
                onToggleFavorite={id => void toggleFavorite(id)}
                onClose={() => select(null)}
              />
            )}
          </>
        )}
      </div>
      {isGeocoding && (
        <div className="h-0.5 w-full bg-gray-200">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
      {view === 'map' && <Filters listings={listings} state={filters} onChange={setFilters} />}
      <footer className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-3 py-1 text-[10px] text-gray-500">
        <span>
          {t('geocodedOf', [String(geocodedCount), String(geocodableCount)])}
          {failedCount > 0 && <span className="ml-2 text-amber-600">· {failedCount} ⚠</span>}
          {pendingCount > 0 && <span className="ml-2 text-blue-600">· {pendingCount} …</span>}
        </span>
        <span>{favorites.size} ★</span>
      </footer>
    </div>
  );
}

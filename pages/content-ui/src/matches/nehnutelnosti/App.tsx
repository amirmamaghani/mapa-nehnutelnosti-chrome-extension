import { AISearch } from './AISearch';
import { Filters } from './Filters';
import { MapView } from './Map';
import { Preview } from './Preview';
import { Settings } from './Settings';
import { createList, hydrateFromBackground, select, setActiveList, toggleFavorite, useOverlayState } from './store';
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
  const { listings, favorites, failedIds, selectedId, lists, activeListId } = useOverlayState();
  const [filters, setFilters] = useState<FilterState>({ priceMax: null, areaMin: null, areaMax: null });
  const [view, setView] = useState<'map' | 'settings'>('map');
  const [aiHighlightIds, setAiHighlightIds] = useState<Set<string> | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);

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

  if (overlayPref.minimized) {
    return (
      <button
        className="fixed bottom-4 right-4 z-[2147483647] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-lg hover:bg-blue-700"
        onClick={() => overlayPrefStorage.set({ ...overlayPref, minimized: false })}
        title={t('expand')}>
        {geocodedCount}
      </button>
    );
  }

  const horizontalClass = overlayPref.expandH ? 'left-4 right-4' : 'right-4 w-[40vw]';
  const verticalClass = overlayPref.expandV ? 'top-4' : 'h-[40vh]';
  const transparencyClass = overlayPref.transparent
    ? 'opacity-40 transition-opacity duration-200 hover:opacity-100'
    : '';

  const onListChange = async (value: string) => {
    if (value === '__new__') {
      const name = window.prompt(t('newListPrompt'));
      if (!name?.trim()) return;
      const created = await createList(name.trim());
      if (created) await setActiveList(created.id);
      return;
    }
    await setActiveList(value);
  };

  return (
    <div
      className={`fixed bottom-4 z-[2147483647] flex flex-col overflow-hidden rounded-lg border border-gray-300 bg-white shadow-2xl ${horizontalClass} ${verticalClass} ${transparencyClass}`}>
      <header
        className="relative flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold"
        title={t('extensionName')}>
        <span className="flex items-center gap-2">
          <select
            value={activeListId}
            onChange={e => void onListChange(e.target.value)}
            className="max-w-[180px] rounded border border-gray-300 bg-white px-1.5 py-1 text-xs font-semibold"
            aria-label={t('activeList')}>
            {lists.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="__new__">+ {t('newList')}</option>
          </select>
          {isGeocoding && (
            <span
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500"
              title={t('geocodingInProgress', [String(pendingCount)])}
            />
          )}
        </span>
        <div className="flex items-center gap-1">
          <label
            className="mr-1 inline-flex cursor-pointer items-center gap-1.5"
            title={overlayPref.indexingEnabled ? t('indexingPause') : t('indexingResume')}>
            <input
              type="checkbox"
              checked={overlayPref.indexingEnabled}
              onChange={e => overlayPrefStorage.set({ ...overlayPref, indexingEnabled: e.target.checked })}
              aria-label="indexing-toggle"
              className="sr-only"
            />
            <span
              className={`text-[10px] font-bold ${overlayPref.indexingEnabled ? 'text-green-600' : 'text-amber-600'}`}>
              {overlayPref.indexingEnabled ? `● ${t('indexingOn')}` : `⏸ ${t('indexingOff')}`}
            </span>
            <span
              className={`relative inline-block h-4 w-7 rounded-full transition-colors ${
                overlayPref.indexingEnabled ? 'bg-green-500' : 'bg-amber-500'
              }`}>
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                  overlayPref.indexingEnabled ? 'left-3.5' : 'left-0.5'
                }`}
              />
            </span>
          </label>
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
            onClick={() => overlayPrefStorage.set({ ...overlayPref, expandH: !overlayPref.expandH })}
            className={`rounded p-1 hover:bg-gray-200 ${overlayPref.expandH ? 'text-blue-600' : 'text-gray-500'}`}
            aria-label="expand-horizontal"
            title={t('expandHorizontal')}>
            ↔
          </button>
          <button
            onClick={() => overlayPrefStorage.set({ ...overlayPref, expandV: !overlayPref.expandV })}
            className={`rounded p-1 hover:bg-gray-200 ${overlayPref.expandV ? 'text-blue-600' : 'text-gray-500'}`}
            aria-label="expand-vertical"
            title={t('expandVertical')}>
            ↕
          </button>
          <button
            onClick={() => overlayPrefStorage.set({ ...overlayPref, minimized: true })}
            className="rounded p-1 text-gray-500 hover:bg-gray-200"
            aria-label="minimize"
            title={t('minimize')}>
            _
          </button>
        </div>
      </header>
      {view === 'map' && (
        <AISearch
          listings={filtered}
          favorites={favorites}
          onResult={(ids, explanation) => {
            setAiHighlightIds(ids);
            setAiExplanation(explanation);
          }}
        />
      )}
      {view === 'map' && aiExplanation && (
        <div className="border-b border-blue-200 bg-blue-50 px-3 py-1 text-[10px] text-blue-700">
          {aiHighlightIds ? `${aiHighlightIds.size} ✓ · ${aiExplanation}` : aiExplanation}
        </div>
      )}
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
              dimmedIds={aiHighlightIds}
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

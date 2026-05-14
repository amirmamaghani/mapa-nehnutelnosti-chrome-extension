import { t } from '@extension/i18n';
import { useMemo } from 'react';
import type { Listing } from '@extension/shared';

type FilterState = {
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
};

type Props = {
  listings: Listing[];
  state: FilterState;
  onChange: (next: FilterState) => void;
};

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

const PRICE_STEP = 10;
const PRICE_FALLBACK = 1_000_000;
const AREA_MIN_BOUND = 50;

const Filters = ({ listings, state, onChange }: Props) => {
  const { priceMaxBound, areaMaxBound } = useMemo(() => {
    const prices = listings.map(l => l.priceEur).filter((n): n is number => typeof n === 'number');
    const areas = listings.map(l => l.areaSqm).filter((n): n is number => typeof n === 'number');
    return {
      priceMaxBound: prices.length ? roundUp(Math.max(...prices), PRICE_STEP) : PRICE_FALLBACK,
      areaMaxBound: roundUp(Math.max(AREA_MIN_BOUND, ...areas), 10),
    };
  }, [listings]);

  const currentPrice = state.priceMax ?? priceMaxBound;
  const currentAreaMin = state.areaMin ?? 0;
  const currentAreaMax = state.areaMax ?? areaMaxBound;

  const areaLowPct = (Math.min(currentAreaMin, currentAreaMax) / areaMaxBound) * 100;
  const areaHighPct = (Math.max(currentAreaMin, currentAreaMax) / areaMaxBound) * 100;

  return (
    <div className="flex items-center gap-4 border-t border-gray-200 bg-white px-3 py-2 text-xs">
      <label className="flex flex-1 flex-col">
        <span className="text-gray-600">
          {t('priceUpTo')}: <b>{currentPrice.toLocaleString('sk-SK')} €</b>
        </span>
        <input
          type="range"
          min={0}
          max={priceMaxBound}
          step={PRICE_STEP}
          value={currentPrice}
          onChange={e => onChange({ ...state, priceMax: Number(e.target.value) })}
        />
      </label>
      <div className="flex flex-1 flex-col">
        <span className="text-gray-600">
          {t('areaRange')}:{' '}
          <b>
            {currentAreaMin}–{currentAreaMax} m²
          </b>
        </span>
        <div className="mn-range-dual">
          <div className="absolute inset-x-0 top-2 h-1 rounded bg-gray-200" />
          <div
            className="absolute top-2 h-1 rounded bg-blue-500"
            style={{ left: `${areaLowPct}%`, right: `${100 - areaHighPct}%` }}
          />
          <input
            type="range"
            min={0}
            max={areaMaxBound}
            step={1}
            value={currentAreaMin}
            onChange={e => {
              const v = Math.min(Number(e.target.value), currentAreaMax);
              onChange({ ...state, areaMin: v });
            }}
            aria-label="area-min"
          />
          <input
            type="range"
            min={0}
            max={areaMaxBound}
            step={1}
            value={currentAreaMax}
            onChange={e => {
              const v = Math.max(Number(e.target.value), currentAreaMin);
              onChange({ ...state, areaMax: v });
            }}
            aria-label="area-max"
          />
        </div>
      </div>
    </div>
  );
};

export { Filters };
export type { FilterState };

import { t } from '@extension/i18n';
import { useStorage } from '@extension/shared';
import { overlayPrefStorage } from '@extension/storage';
import { useState } from 'react';
import type { MarkerLabel } from '@extension/storage';

type Props = {
  onClose: () => void;
};

const LABEL_OPTIONS: {
  value: MarkerLabel;
  key: 'markerLabelNone' | 'markerLabelPrice' | 'markerLabelTitle' | 'markerLabelArea';
}[] = [
  { value: 'none', key: 'markerLabelNone' },
  { value: 'price', key: 'markerLabelPrice' },
  { value: 'title', key: 'markerLabelTitle' },
  { value: 'area', key: 'markerLabelArea' },
];

export const Settings = ({ onClose }: Props) => {
  const pref = useStorage(overlayPrefStorage);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const onClear = async () => {
    setClearing(true);
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    setClearing(false);
    setCleared(true);
  };

  const version = chrome.runtime.getManifest().version;

  return (
    <div className="flex h-full flex-col gap-3 bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('settingsTitle')}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="close">
          ×
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-600">{t('markerLabelSetting')}</span>
          <select
            value={pref.markerLabel}
            onChange={e => overlayPrefStorage.set({ ...pref, markerLabel: e.target.value as MarkerLabel })}
            className="rounded border border-gray-300 px-2 py-1.5">
            {LABEL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {t(opt.key)}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={onClear}
          disabled={clearing}
          className="rounded border border-gray-300 px-3 py-2 text-left text-xs hover:bg-gray-50 disabled:opacity-50">
          {clearing ? t('clearing') : cleared ? t('cleared') : t('clearCache')}
        </button>
      </div>
      <div className="mt-auto border-t border-gray-200 pt-3 text-xs text-gray-500">
        <div>
          ©{' '}
          <a
            className="underline"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer">
            OpenStreetMap
          </a>{' '}
          contributors · {t('geocodingBy')}{' '}
          <a
            className="underline"
            href="https://operations.osmfoundation.org/policies/nominatim/"
            target="_blank"
            rel="noopener noreferrer">
            Nominatim
          </a>
        </div>
        <div className="mt-1">v{version}</div>
      </div>
    </div>
  );
};

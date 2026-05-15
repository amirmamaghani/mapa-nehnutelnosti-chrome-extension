import { AISettings } from './ai';
import { deleteList, downloadListCsv, importListCsv, renameList, setActiveList, useOverlayState } from './store';
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
  const { lists } = useOverlayState();
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const onClear = async () => {
    setClearing(true);
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
    setClearing(false);
    setCleared(true);
  };

  const onRename = async (id: string, currentName: string) => {
    const name = window.prompt(t('renameListPrompt'), currentName);
    if (!name?.trim() || name.trim() === currentName) return;
    await renameList(id, name.trim());
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(t('deleteListConfirm', [name]))) return;
    await deleteList(id);
  };

  const onImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const defaultName = file.name.replace(/\.csv$/i, '');
      const name = window.prompt(t('importListPrompt'), defaultName);
      if (!name?.trim()) return;
      const csv = await file.text();
      const resp = await importListCsv(name.trim(), csv);
      if (!resp) return;
      await setActiveList(resp.list.id);
      window.alert(t('importDone', [String(resp.imported), String(resp.skipped)]));
    };
    input.click();
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
        <label htmlFor="pref-transparent" className="flex items-start gap-2 text-xs">
          <input
            id="pref-transparent"
            type="checkbox"
            checked={pref.transparent}
            onChange={e => overlayPrefStorage.set({ ...pref, transparent: e.target.checked })}
            aria-label={t('transparentSetting')}
            className="mt-0.5"
          />
          <span className="flex flex-col">
            <span className="text-gray-800">{t('transparentSetting')}</span>
            <span className="text-gray-500">{t('transparentSettingHint')}</span>
          </span>
        </label>
        <button
          onClick={onClear}
          disabled={clearing}
          className="rounded border border-gray-300 px-3 py-2 text-left text-xs hover:bg-gray-50 disabled:opacity-50">
          {clearing ? t('clearing') : cleared ? t('cleared') : t('clearCache')}
        </button>
      </div>
      <AISettings />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-600">{t('listsSection')}</div>
          <button onClick={onImport} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
            {t('importCsv')}
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {lists.map(l => (
            <li key={l.id} className="flex items-center gap-2 rounded border border-gray-200 px-2 py-1.5 text-xs">
              <span className="flex-1 truncate" title={l.name}>
                {l.name}
              </span>
              <button onClick={() => void onRename(l.id, l.name)} className="text-gray-500 hover:text-gray-800">
                {t('rename')}
              </button>
              <button onClick={() => void downloadListCsv(l.id)} className="text-gray-500 hover:text-gray-800">
                {t('exportCsv')}
              </button>
              <button onClick={() => void onDelete(l.id, l.name)} className="text-red-500 hover:text-red-700">
                {t('delete')}
              </button>
            </li>
          ))}
        </ul>
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

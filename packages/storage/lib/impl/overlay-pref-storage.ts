import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

export type OverlayMode = 'collapsed' | 'normal' | 'maximized';

export type MarkerLabel = 'none' | 'price' | 'title' | 'area';

export type OverlayPrefStateType = {
  mode: OverlayMode;
  markerLabel: MarkerLabel;
};

export const overlayPrefStorage: BaseStorageType<OverlayPrefStateType> = createStorage<OverlayPrefStateType>(
  'overlay-pref',
  { mode: 'normal', markerLabel: 'none' },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

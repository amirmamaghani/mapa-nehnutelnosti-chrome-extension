import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

export type MarkerLabel = 'none' | 'price' | 'title' | 'area';

export type OverlayPrefStateType = {
  minimized: boolean;
  expandH: boolean;
  expandV: boolean;
  markerLabel: MarkerLabel;
  /** Empty until the background has created at least one list. */
  activeListId: string;
};

export const overlayPrefStorage: BaseStorageType<OverlayPrefStateType> = createStorage<OverlayPrefStateType>(
  'overlay-pref',
  { minimized: false, expandH: false, expandV: false, markerLabel: 'none', activeListId: '' },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

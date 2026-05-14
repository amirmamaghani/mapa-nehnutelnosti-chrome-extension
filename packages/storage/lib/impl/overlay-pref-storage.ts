import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

export type MarkerLabel = 'none' | 'price' | 'title' | 'area';

export type OverlayPrefStateType = {
  minimized: boolean;
  expandH: boolean;
  expandV: boolean;
  markerLabel: MarkerLabel;
  /** Render the overlay at reduced opacity, restored to 100% on hover. */
  transparent: boolean;
  /** When false, background ignores LISTINGS_EXTRACTED so unrelated searches don't pollute the active list. */
  indexingEnabled: boolean;
  /** Empty until the background has created at least one list. */
  activeListId: string;
};

export const overlayPrefStorage: BaseStorageType<OverlayPrefStateType> = createStorage<OverlayPrefStateType>(
  'overlay-pref',
  {
    minimized: false,
    expandH: false,
    expandV: false,
    markerLabel: 'none',
    transparent: false,
    indexingEnabled: true,
    activeListId: '',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

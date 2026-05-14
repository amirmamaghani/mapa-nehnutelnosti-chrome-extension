import { t } from '@extension/i18n';
import { PAGE_MESSAGE_NAMESPACE } from '@extension/shared';
import type { Listing, PageMessage } from '@extension/shared';

type Props = {
  listing: Listing;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onClose: () => void;
};

const postHighlight = (listing: Listing) => {
  const message: { namespace: string; payload: PageMessage } = {
    namespace: PAGE_MESSAGE_NAMESPACE,
    payload: { type: 'HIGHLIGHT_LISTING', site: listing.site, siteListingId: listing.siteListingId },
  };
  window.postMessage(message, '*');
};

export const Preview = ({ listing, isFavorite, onToggleFavorite, onClose }: Props) => (
  <div className="absolute right-3 top-3 z-[1000] w-72 rounded-lg bg-white p-3 shadow-xl">
    <div className="flex items-start justify-between gap-2">
      <a
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="line-clamp-2 text-sm font-semibold text-blue-700 hover:underline">
        {listing.title}
      </a>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="close">
        ×
      </button>
    </div>
    {listing.thumbnailUrl && (
      <a href={listing.url} target="_blank" rel="noopener noreferrer">
        <img src={listing.thumbnailUrl} alt="" className="mt-2 h-32 w-full rounded object-cover" />
      </a>
    )}
    <div className="mt-2 text-xs text-gray-700">
      {listing.priceEur != null && <span className="font-medium">{listing.priceEur.toLocaleString('sk-SK')} €</span>}
      {listing.areaSqm != null && <span> · {listing.areaSqm} m²</span>}
    </div>
    {listing.addressRaw && <div className="mt-1 text-xs text-gray-500">{listing.addressRaw}</div>}
    <div className="mt-3 flex gap-2">
      <button
        onClick={() => onToggleFavorite(listing.id)}
        className={`flex-1 rounded border px-2 py-1 text-xs ${
          isFavorite ? 'border-yellow-500 bg-yellow-50 text-yellow-700' : 'border-gray-300 text-gray-700'
        }`}>
        {isFavorite ? `★ ${t('favoriteOn')}` : `☆ ${t('favoriteOff')}`}
      </button>
      <button
        onClick={() => postHighlight(listing)}
        className="flex-1 rounded border border-blue-500 bg-blue-50 px-2 py-1 text-xs text-blue-700">
        {t('showOnPage')}
      </button>
    </div>
  </div>
);

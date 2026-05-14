import { PAGE_MESSAGE_NAMESPACE, pickAdapter } from '@extension/shared';
import type { PageMessage, RawListing, RuntimeMessage } from '@extension/shared';

const HIGHLIGHT_CLASS = 'mn-highlight';
const HIGHLIGHT_DURATION_MS = 2000;
const DEBOUNCE_MS = 200;

const adapter = pickAdapter(new URL(window.location.href));
if (!adapter) {
  console.warn('[mapa-nehnutelnosti] no adapter for', window.location.hostname);
}

const knownIds = new Set<string>();

const idOf = (raw: RawListing) => `${raw.site}:${raw.siteListingId}`;

const send = (msg: RuntimeMessage) => {
  void chrome.runtime.sendMessage(msg).catch(() => {
    /* extension may be reloading */
  });
};

const sweep = () => {
  if (!adapter) return;
  const pageType = adapter.detectPageType(document);
  if (pageType === 'unknown') return;

  const current = adapter.extractListings(document);
  if (pageType === 'list' && current.length === 0) {
    console.warn('[mapa-nehnutelnosti] adapter returned 0 listings on a list page');
    return;
  }

  // Only ship listings we haven't already announced this session. Removals
  // intentionally do not propagate — pins should accumulate as the user
  // paginates through results, so the map stays useful across pages.
  const toAdd = current.filter(r => !knownIds.has(idOf(r)));
  if (toAdd.length > 0) send({ type: 'LISTINGS_EXTRACTED', listings: toAdd });
  for (const raw of current) knownIds.add(idOf(raw));
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSweep = () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(sweep, DEBOUNCE_MS);
};

const handleHighlight = (msg: PageMessage) => {
  if (!adapter) return;
  if (msg.site !== adapter.site) return;
  const node = adapter.findListingNode(document, msg.siteListingId);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.add(HIGHLIGHT_CLASS);
  setTimeout(() => node.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_DURATION_MS);
};

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if ((data as { namespace?: string }).namespace !== PAGE_MESSAGE_NAMESPACE) return;
  const payload = (data as { payload?: PageMessage }).payload;
  if (payload?.type === 'HIGHLIGHT_LISTING') handleHighlight(payload);
});

const injectHighlightCss = () => {
  const style = document.createElement('style');
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 3px solid #ffb300 !important;
      outline-offset: 2px;
      transition: outline-color 0.3s ease;
      border-radius: 6px;
    }
  `;
  document.head.appendChild(style);
};

if (adapter) {
  injectHighlightCss();
  sweep();
  const root = adapter.getObservationRoot(document) ?? document.body;
  const observer = new MutationObserver(debouncedSweep);
  observer.observe(root, { childList: true, subtree: true });

  // When the user resumes indexing, listings already extracted during the
  // paused window are sitting in knownIds and won't be re-sent. Forget what
  // we've seen and re-extract so the active list catches up immediately.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const c = changes['overlay-pref'];
    if (!c) return;
    const oldEnabled = (c.oldValue as { indexingEnabled?: boolean } | undefined)?.indexingEnabled ?? true;
    const newEnabled = (c.newValue as { indexingEnabled?: boolean } | undefined)?.indexingEnabled ?? true;
    if (newEnabled && !oldEnabled) {
      knownIds.clear();
      sweep();
    }
  });
}

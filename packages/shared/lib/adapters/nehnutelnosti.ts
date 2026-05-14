import { SK_TOWNS_SET } from '../data/sk-towns.js';
import type { SiteAdapter } from '../types/adapter.js';
import type { RawListing } from '../types/listing.js';

const SITE = 'nehnutelnosti' as const;

const DETAIL_LINK_SELECTOR = 'a[href*="/detail/"]';
const DETAIL_ID_RE = /\/detail\/([^/?#]+)/i;
const LIST_URL_RE = /^\/(predaj|prenajom|hladaj|vysledky)/i;
const DETAIL_URL_RE = /^\/detail\//i;

const TITLE_PHOTO_SUFFIX_RE = /\s*[-–—]\s*fotka inzer[áa]tu\s+\d+\s*$/i;

// Stable element used by nehnutelnosti.sk for price + other text fields.
const TEXT_FIELD_SELECTOR = '[data-test-id="text"], [data-testid="text"]';

// Match a price followed by €. Allows decimal comma/dot ("295,5 €") and
// thousands separators (regular space, NBSP, dot). Rejects per-m² rates
// explicitly so we don't treat unit cost as the listing price.
const PRICE_RE = /(\d{1,3}(?:[\s.]\d{3})+|\d{2,})(?:[,.]\d+)?\s*€(?!\s*\/\s*m\s*[²2])/u;
const AREA_RE = /\b(\d{1,4}(?:[.,]\d+)?)\s*m\s*[²2]\b/u;

const cardContainer = (link: Element): HTMLElement | null => {
  const grid = link.closest('div.MuiGrid-container');
  if (grid instanceof HTMLElement) return grid;
  const article = link.closest('article, li');
  if (article instanceof HTMLElement) return article;
  return null;
};

const parseEuros = (raw: string): number | undefined => {
  // Remove thousands separators, normalize decimal comma → dot.
  const normalized = raw.replace(/[\s ]/g, '').replace(',', '.');
  const m = normalized.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:\.\d+)?$/);
  if (!m) return undefined;
  const intPart = m[1].replace(/\./g, '');
  const n = Number.parseInt(intPart, 10);
  return Number.isFinite(n) && n >= 50 ? n : undefined;
};

const parseArea = (raw: string): number | undefined => {
  const n = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);

// Find an SK town in the text using whole-word matching. Returns the LAST
// match (cities usually appear at the end of a location string) so that
// substrings like "Zvolen" inside "Zvolenská" are correctly skipped.
const findKnownTown = (text: string): string | null => {
  const lowered = text.toLowerCase();
  let best: { idx: number; len: number } | null = null;
  for (const lc of SK_TOWNS_SET) {
    let from = 0;
    while (from <= lowered.length) {
      const idx = lowered.indexOf(lc, from);
      if (idx < 0) break;
      const before = lowered[idx - 1];
      const after = lowered[idx + lc.length];
      if (!isLetter(before) && !isLetter(after)) {
        if (!best || idx > best.idx) best = { idx, len: lc.length };
      }
      from = idx + lc.length;
    }
  }
  return best ? text.slice(best.idx, best.idx + best.len) : null;
};

const cleanTitle = (raw: string): string => raw.replace(TITLE_PHOTO_SUFFIX_RE, '').trim();

const findThumbnail = (card: HTMLElement): { src?: string; alt?: string } => {
  const imgs = Array.from(card.querySelectorAll('img'));
  for (const img of imgs) {
    const src = img.getAttribute('src') ?? '';
    if (src.includes('unitedclassifieds')) {
      return { src, alt: img.getAttribute('alt') ?? img.getAttribute('title') ?? undefined };
    }
  }
  const first = imgs[0];
  return first ? { src: first.getAttribute('src') ?? undefined, alt: first.getAttribute('alt') ?? undefined } : {};
};

const detailIdFromHref = (href: string): string | null => {
  const m = href.match(DETAIL_ID_RE);
  return m ? m[1] : null;
};

const extractPrice = (card: HTMLElement): number | undefined => {
  // Prefer the dedicated text element that contains €. Then fallback to a
  // regex sweep over the whole card text.
  const textNodes = Array.from(card.querySelectorAll(TEXT_FIELD_SELECTOR));
  for (const node of textNodes) {
    const t = node.textContent ?? '';
    if (!t.includes('€')) continue;
    const m = t.match(PRICE_RE);
    if (m) {
      const n = parseEuros(m[1] + (m[0].match(/[,.]\d+/)?.[0] ?? ''));
      if (n) return n;
    }
  }
  const m = (card.textContent ?? '').match(PRICE_RE);
  if (!m) return undefined;
  return parseEuros(m[1] + (m[0].match(/[,.]\d+/)?.[0] ?? ''));
};

const extractArea = (card: HTMLElement): number | undefined => {
  const m = (card.textContent ?? '').match(AREA_RE);
  return m ? parseArea(m[1]) : undefined;
};

const extractAddress = (card: HTMLElement, title: string): string => {
  // Prefer the richest text-field that contains a known SK town. The site
  // formats addresses like "Zvolenská, Nitra, okres Nitra" — feeding that
  // verbatim to Nominatim yields rooftop-level geocoding instead of a city
  // centroid.
  const nodes = Array.from(card.querySelectorAll(TEXT_FIELD_SELECTOR));
  let best: { text: string; score: number } | null = null;
  for (const node of nodes) {
    const t = (node.textContent ?? '').trim();
    if (!t || t.includes('€') || /m\s*[²2]/u.test(t)) continue;
    if (!findKnownTown(t)) continue;
    const score = (t.includes(',') ? 100 : 0) + Math.min(t.length, 120);
    if (!best || score > best.score) best = { text: t, score };
  }
  if (best) return /\bSK\b/i.test(best.text) ? best.text : `${best.text}, SK`;

  const city = findKnownTown(card.textContent ?? '') ?? findKnownTown(title);
  return city ? `${city}, SK` : '';
};

export const nehnutelnostiAdapter: SiteAdapter = {
  site: SITE,

  matches(url) {
    return url.hostname.endsWith('nehnutelnosti.sk');
  },

  detectPageType(doc) {
    const url = new URL(doc.location?.href ?? 'about:blank');
    if (DETAIL_URL_RE.test(url.pathname)) return 'detail';
    if (url.pathname === '/' || LIST_URL_RE.test(url.pathname)) return 'list';
    if (doc.querySelector(DETAIL_LINK_SELECTOR)) return 'list';
    return 'unknown';
  },

  extractListings(doc) {
    if (this.detectPageType(doc) === 'unknown') return [];

    const links = Array.from(doc.querySelectorAll(DETAIL_LINK_SELECTOR));
    const byId = new Map<string, RawListing>();

    for (const link of links) {
      const href = link.getAttribute('href') ?? '';
      const siteListingId = detailIdFromHref(href);
      if (!siteListingId || byId.has(siteListingId)) continue;

      const card = cardContainer(link);
      if (!card) continue;

      const thumb = findThumbnail(card);
      const title = thumb.alt ? cleanTitle(thumb.alt) : siteListingId;

      const priceEur = extractPrice(card);
      const areaSqm = extractArea(card);
      const addressRaw = extractAddress(card, title);

      const absoluteUrl = href.startsWith('http')
        ? href
        : new URL(href, doc.location?.href ?? 'https://www.nehnutelnosti.sk/').href;

      byId.set(siteListingId, {
        site: SITE,
        siteListingId,
        url: absoluteUrl,
        title,
        addressRaw,
        thumbnailUrl: thumb.src,
        priceEur,
        areaSqm,
      });
    }

    return Array.from(byId.values());
  },

  findListingNode(doc, siteListingId) {
    const link = doc.querySelector(`a[href*="/detail/${siteListingId}"]`) as HTMLElement | null;
    if (!link) return null;
    return cardContainer(link);
  },

  getObservationRoot(doc) {
    const firstLink = doc.querySelector(DETAIL_LINK_SELECTOR);
    if (!firstLink) return doc.querySelector('main') as HTMLElement | null;
    const card = cardContainer(firstLink);
    const parent = card?.parentElement;
    return (parent as HTMLElement | null) ?? (doc.querySelector('main') as HTMLElement | null);
  },
};

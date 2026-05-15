import type { ToolSchema } from './llm/index.js';
import type { Listing } from '@extension/shared';

type ToolName = 'filter_listings' | 'sort_and_limit' | 'aggregate' | 'describe_listings';

const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'filter_listings',
    description:
      "Filter the user's current list of real-estate listings by structured criteria. Returns matching listing IDs. Call this first to narrow the set, then optionally sort_and_limit or describe_listings.",
    parameters: {
      type: 'object',
      properties: {
        priceMin: { type: 'number', description: 'Minimum price in EUR (inclusive).' },
        priceMax: { type: 'number', description: 'Maximum price in EUR (inclusive).' },
        areaMin: { type: 'number', description: 'Minimum area in square meters (inclusive).' },
        areaMax: { type: 'number', description: 'Maximum area in square meters (inclusive).' },
        addressContains: {
          type: 'string',
          description:
            'Case-insensitive substring match on the listing address (e.g. "Petržalka", "Ružinov", "Bratislava"). Use for neighbourhood or city queries.',
        },
        hasCoord: { type: 'boolean', description: 'When true, only return listings that have been geocoded.' },
        favoritesOnly: { type: 'boolean', description: 'When true, only return listings the user has starred.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'sort_and_limit',
    description:
      'Sort a set of listing IDs and limit the result. Useful for "top 3 cheapest" or "best price per m²" queries.',
    parameters: {
      type: 'object',
      required: ['by'],
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Listing IDs to sort. Omit to sort the entire current list.',
        },
        by: { type: 'string', enum: ['price', 'area', 'pricePerSqm'], description: 'Sort key.' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default: asc).' },
        limit: { type: 'number', description: 'Maximum number of IDs to return.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'aggregate',
    description:
      'Compute summary statistics over a set of listings: count, average/min/max price and area, average price per m².',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Listing IDs to aggregate. Omit for the entire current list.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'describe_listings',
    description:
      'Fetch full text (title, address, price, area, URL) for up to 20 specific listings — call this when you need details to write the final answer.',
    parameters: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Listing IDs to fetch.' },
      },
      additionalProperties: false,
    },
  },
];

type ToolContext = {
  listings: Listing[];
  favorites: Set<string>;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const ids = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? (v as string[]) : undefined;

const runTool = (name: string, args: Record<string, unknown>, ctx: ToolContext): unknown => {
  switch (name as ToolName) {
    case 'filter_listings':
      return filterListings(args, ctx);
    case 'sort_and_limit':
      return sortAndLimit(args, ctx);
    case 'aggregate':
      return aggregate(args, ctx);
    case 'describe_listings':
      return describeListings(args, ctx);
    default:
      return { error: `unknown tool: ${name}` };
  }
};

const filterListings = (args: Record<string, unknown>, ctx: ToolContext) => {
  const priceMin = num(args.priceMin);
  const priceMax = num(args.priceMax);
  const areaMin = num(args.areaMin);
  const areaMax = num(args.areaMax);
  const addressContains = str(args.addressContains)?.toLowerCase();
  const hasCoord = bool(args.hasCoord);
  const favoritesOnly = bool(args.favoritesOnly);

  const matched = ctx.listings.filter(l => {
    if (priceMin != null && (l.priceEur == null || l.priceEur < priceMin)) return false;
    if (priceMax != null && (l.priceEur == null || l.priceEur > priceMax)) return false;
    if (areaMin != null && (l.areaSqm == null || l.areaSqm < areaMin)) return false;
    if (areaMax != null && (l.areaSqm == null || l.areaSqm > areaMax)) return false;
    if (addressContains && !l.addressRaw.toLowerCase().includes(addressContains)) return false;
    if (hasCoord === true && !l.coord) return false;
    if (hasCoord === false && l.coord) return false;
    if (favoritesOnly && !ctx.favorites.has(l.id)) return false;
    return true;
  });
  return { matchedIds: matched.map(l => l.id), count: matched.length };
};

const sortAndLimit = (args: Record<string, unknown>, ctx: ToolContext) => {
  const subset = ids(args.ids);
  const by = str(args.by) as 'price' | 'area' | 'pricePerSqm' | undefined;
  const order = (str(args.order) ?? 'asc') as 'asc' | 'desc';
  const limit = num(args.limit);
  if (!by) return { error: 'missing "by"' };

  const pool = subset ? ctx.listings.filter(l => subset.includes(l.id)) : ctx.listings.slice();

  const keyOf = (l: Listing): number | null => {
    if (by === 'price') return l.priceEur ?? null;
    if (by === 'area') return l.areaSqm ?? null;
    if (l.priceEur == null || l.areaSqm == null || l.areaSqm === 0) return null;
    return l.priceEur / l.areaSqm;
  };

  const sorted = pool
    .map(l => ({ l, k: keyOf(l) }))
    .filter(x => x.k != null)
    .sort((a, b) => (order === 'desc' ? (b.k as number) - (a.k as number) : (a.k as number) - (b.k as number)))
    .map(x => x.l);

  const result = limit != null ? sorted.slice(0, limit) : sorted;
  return { sortedIds: result.map(l => l.id), count: result.length };
};

const aggregate = (args: Record<string, unknown>, ctx: ToolContext) => {
  const subset = ids(args.ids);
  const pool = subset ? ctx.listings.filter(l => subset.includes(l.id)) : ctx.listings;
  const prices = pool.map(l => l.priceEur).filter((n): n is number => typeof n === 'number');
  const areas = pool.map(l => l.areaSqm).filter((n): n is number => typeof n === 'number');
  const ppsm = pool
    .filter(l => l.priceEur != null && l.areaSqm != null && l.areaSqm > 0)
    .map(l => (l.priceEur as number) / (l.areaSqm as number));

  const stats = (arr: number[]) =>
    arr.length === 0
      ? { count: 0 }
      : {
          count: arr.length,
          avg: arr.reduce((a, b) => a + b, 0) / arr.length,
          min: Math.min(...arr),
          max: Math.max(...arr),
        };

  return { count: pool.length, price: stats(prices), area: stats(areas), pricePerSqm: stats(ppsm) };
};

const describeListings = (args: Record<string, unknown>, ctx: ToolContext) => {
  const want = ids(args.ids) ?? [];
  const byId = new Map(ctx.listings.map(l => [l.id, l]));
  return {
    listings: want
      .map(id => byId.get(id))
      .filter((l): l is Listing => !!l)
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        title: l.title,
        address: l.addressRaw,
        priceEur: l.priceEur ?? null,
        areaSqm: l.areaSqm ?? null,
        pricePerSqm:
          l.priceEur != null && l.areaSqm != null && l.areaSqm > 0 ? Math.round(l.priceEur / l.areaSqm) : null,
        url: l.url,
        hasCoord: !!l.coord,
      })),
  };
};

export { TOOL_SCHEMAS, runTool };
export type { ToolContext, ToolName };

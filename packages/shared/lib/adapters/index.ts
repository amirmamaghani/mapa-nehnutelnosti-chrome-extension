import { nehnutelnostiAdapter } from './nehnutelnosti.js';
import type { SiteAdapter } from '../types/adapter.js';

export const ADAPTERS: ReadonlyArray<SiteAdapter> = [nehnutelnostiAdapter];

export const pickAdapter = (url: URL): SiteAdapter | null => ADAPTERS.find(a => a.matches(url)) ?? null;

export { nehnutelnostiAdapter };

/**
 * AI search module — natural-language querying over the active list via tool-calling LLMs.
 *
 * Marked as **experimental**: the API surface, tool schemas and supported providers
 * may change without notice. Self-contained: only `AISearch` and `AISettings` are
 * meant to be imported from outside this directory.
 */
export { AISearch } from './AISearch.js';
export { AISettings, ExperimentalBadge } from './AISettings.js';

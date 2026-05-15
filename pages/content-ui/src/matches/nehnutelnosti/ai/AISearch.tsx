import { runAgent } from './agent.js';
import { backgroundFetch } from './bg-fetch.js';
import { createLLMClient } from './llm/index.js';
import { t } from '@extension/i18n';
import { useStorage } from '@extension/shared';
import { aiPrefStorage } from '@extension/storage';
import { useRef, useState } from 'react';
import type { AgentProgress } from './agent.js';
import type { Listing } from '@extension/shared';

type Props = {
  listings: Listing[];
  favorites: Set<string>;
  onResult: (ids: Set<string> | null, explanation: string | null) => void;
};

const TOOL_LABELS: Record<string, string> = {
  filter_listings: 'Filtering',
  sort_and_limit: 'Sorting',
  aggregate: 'Aggregating',
  describe_listings: 'Reading details',
};

const formatProgress = (p: AgentProgress): string => {
  if (p.phase === 'thinking') return `Thinking… (${p.iteration})`;
  if (p.phase === 'finalising') return 'Finalising answer…';
  const label = TOOL_LABELS[p.name] ?? p.name;
  return p.resultPreview ? `${label} → ${p.resultPreview}` : `${label}…`;
};

const AISearch = ({ listings, favorites, onResult }: Props) => {
  const pref = useStorage(aiPrefStorage);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<AgentProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  if (!pref.enabled) return null;

  const canSubmit = pref.apiKey.trim().length > 0 || pref.provider === 'local';

  const onSubmit = async () => {
    const q = query.trim();
    if (!q || !canSubmit || loading) return;
    setLoading(true);
    setError(null);
    setProgress(null);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const client = createLLMClient({
        provider: pref.provider,
        apiKey: pref.apiKey,
        baseUrl: pref.baseUrl,
        model: pref.model,
        fetchImpl: backgroundFetch,
      });
      const result = await runAgent(
        q,
        client,
        { listings, favorites },
        {
          systemPrompt: pref.systemPrompt,
          signal: ctrl.signal,
          onProgress: setProgress,
        },
      );
      onResult(new Set(result.matchedIds), result.explanation);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message ?? 'Error');
      onResult(null, null);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const onClear = () => {
    abortRef.current?.abort();
    setQuery('');
    setError(null);
    setProgress(null);
    onResult(null, null);
  };

  return (
    <div className="flex flex-col border-b border-gray-200 bg-white">
      <div className="flex items-center gap-1 px-3 py-1.5">
        <span className="text-sm text-gray-400">{loading ? <Spinner /> : '🔍'}</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void onSubmit();
            if (e.key === 'Escape') {
              if (loading) abortRef.current?.abort();
              else onClear();
            }
          }}
          placeholder={canSubmit ? t('aiSearchPlaceholder') : t('aiSearchNeedsKey')}
          disabled={!canSubmit}
          className="flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
        />
        {error && (
          <span className="max-w-[220px] truncate text-xs text-red-500" title={error}>
            {error}
          </span>
        )}
        {loading && (
          <button
            onClick={() => abortRef.current?.abort()}
            className="text-xs text-gray-400 hover:text-red-600"
            aria-label="abort-ai-search"
            title="Cancel">
            ×
          </button>
        )}
        {!loading && query && (
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-700" aria-label="clear-ai-search">
            ×
          </button>
        )}
      </div>
      {loading && (
        <div className="flex items-center gap-2 border-t border-gray-100 bg-blue-50 px-3 py-1 text-[10px] text-blue-700">
          <Pulse />
          <span className="flex-1 truncate">{progress ? formatProgress(progress) : 'Starting…'}</span>
        </div>
      )}
    </div>
  );
};

const Spinner = () => (
  <span
    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
    aria-label="loading"
  />
);

const Pulse = () => <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />;

export { AISearch };

import { DEFAULT_SYSTEM_PROMPT } from './agent.js';
import { t } from '@extension/i18n';
import { useStorage } from '@extension/shared';
import { aiPrefStorage, DEFAULT_MODELS, LOCAL_BASE_URL_HINT } from '@extension/storage';
import type { AIProvider } from '@extension/storage';

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  local: 'Local (LM Studio / Ollama)',
};

const AISettings = () => {
  const aiPref = useStorage(aiPrefStorage);

  return (
    <div className="flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 p-2.5">
      <label htmlFor="ai-enabled" className="flex items-start gap-2 text-xs">
        <input
          id="ai-enabled"
          type="checkbox"
          checked={aiPref.enabled}
          onChange={e => aiPrefStorage.set({ ...aiPref, enabled: e.target.checked })}
          aria-label={t('aiEnable')}
          className="mt-0.5"
        />
        <span className="flex flex-1 flex-col">
          <span className="flex items-center gap-1.5 font-semibold text-gray-800">
            {t('aiEnable')}
            <ExperimentalBadge />
          </span>
          <span className="text-gray-500">{t('aiEnableHint')}</span>
        </span>
      </label>
      {aiPref.enabled && (
        <div className="flex flex-col gap-2 pl-6">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-gray-600">{t('aiProvider')}</span>
            <select
              value={aiPref.provider}
              onChange={e => {
                const next = e.target.value as AIProvider;
                aiPrefStorage.set({ ...aiPref, provider: next, model: DEFAULT_MODELS[next] });
              }}
              className="rounded border border-gray-300 px-2 py-1.5">
              {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map(p => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          {aiPref.provider !== 'local' && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-gray-600">{t('aiApiKey')}</span>
              <input
                type="password"
                value={aiPref.apiKey}
                onChange={e => aiPrefStorage.set({ ...aiPref, apiKey: e.target.value })}
                placeholder={aiPref.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className="rounded border border-gray-300 px-2 py-1.5 font-mono"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-gray-600">
              {aiPref.provider === 'local' ? t('aiLocalUrl') : t('aiBaseUrlOptional')}
            </span>
            <input
              type="text"
              value={aiPref.baseUrl}
              onChange={e => aiPrefStorage.set({ ...aiPref, baseUrl: e.target.value })}
              placeholder={aiPref.provider === 'local' ? LOCAL_BASE_URL_HINT : ''}
              className="rounded border border-gray-300 px-2 py-1.5 font-mono"
              spellCheck={false}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-gray-600">{t('aiModel')}</span>
            <input
              type="text"
              value={aiPref.model}
              onChange={e => aiPrefStorage.set({ ...aiPref, model: e.target.value })}
              placeholder={DEFAULT_MODELS[aiPref.provider]}
              className="rounded border border-gray-300 px-2 py-1.5 font-mono"
              spellCheck={false}
            />
          </label>
          <details className="text-xs">
            <summary className="cursor-pointer select-none text-gray-600 hover:text-gray-800">
              {t('aiSystemPrompt')}
            </summary>
            <div className="mt-1 flex flex-col gap-1">
              <textarea
                value={aiPref.systemPrompt}
                onChange={e => aiPrefStorage.set({ ...aiPref, systemPrompt: e.target.value })}
                placeholder={DEFAULT_SYSTEM_PROMPT}
                rows={8}
                className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-[10px] leading-snug"
                spellCheck={false}
              />
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>{t('aiSystemPromptHint')}</span>
                {aiPref.systemPrompt && (
                  <button
                    onClick={() => aiPrefStorage.set({ ...aiPref, systemPrompt: '' })}
                    className="text-blue-600 hover:underline">
                    {t('aiSystemPromptReset')}
                  </button>
                )}
              </div>
            </div>
          </details>
          <div className="text-[10px] text-amber-700">⚠ {t('aiPrivacyWarning')}</div>
        </div>
      )}
    </div>
  );
};

const ExperimentalBadge = () => (
  <span
    className="rounded bg-amber-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900"
    title={t('experimentalHint')}>
    🧪 {t('experimental')}
  </span>
);

export { AISettings, ExperimentalBadge };

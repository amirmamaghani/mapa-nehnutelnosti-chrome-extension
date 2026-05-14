import { createStorage, StorageEnum } from '../base/index.js';
import type { BaseStorageType } from '../base/index.js';

export type AIProvider = 'openai' | 'anthropic' | 'openrouter' | 'local';

export type AIPrefStateType = {
  enabled: boolean;
  provider: AIProvider;
  /** API key for cloud providers; ignored by Ollama. */
  apiKey: string;
  /** Base URL — used by Ollama (e.g. http://localhost:11434) and OpenRouter override. Empty falls back to provider default. */
  baseUrl: string;
  /** Model name as recognised by the provider. */
  model: string;
  /** Optional override for the agent's system prompt. Empty string falls back to the bundled default. */
  systemPrompt: string;
};

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  openrouter: 'openai/gpt-4o-mini',
  local: '',
};

/** Suggested base URLs for the local provider — LM Studio default 1234, Ollama default 11434. */
export const LOCAL_BASE_URL_HINT = 'http://localhost:1234/v1';

export const aiPrefStorage: BaseStorageType<AIPrefStateType> = createStorage<AIPrefStateType>(
  'ai-pref',
  {
    enabled: false,
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    model: DEFAULT_MODELS.openai,
    systemPrompt: '',
  },
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
  },
);

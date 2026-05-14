import { createAnthropicClient } from './anthropic.js';
import { createOpenAIClient } from './openai.js';
import type { FetchLike, LLMClient } from './types.js';

export type ClientConfig = {
  provider: 'openai' | 'anthropic' | 'openrouter' | 'local';
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Optional fetch override — useful when the caller is a content script that needs to bypass CORS / Private Network Access by routing through a service worker. */
  fetchImpl?: FetchLike;
};

export const createLLMClient = (cfg: ClientConfig): LLMClient => {
  switch (cfg.provider) {
    case 'openai':
      return createOpenAIClient({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        fetchImpl: cfg.fetchImpl,
      });
    case 'openrouter':
      return createOpenAIClient({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl || 'https://openrouter.ai/api',
        fetchImpl: cfg.fetchImpl,
      });
    case 'anthropic':
      return createAnthropicClient({
        apiKey: cfg.apiKey,
        model: cfg.model,
        baseUrl: cfg.baseUrl,
        fetchImpl: cfg.fetchImpl,
      });
    case 'local':
      // OpenAI-compatible: works with LM Studio, Ollama (/v1), llama.cpp server, vLLM, etc.
      return createOpenAIClient({
        apiKey: cfg.apiKey || 'not-needed',
        model: cfg.model,
        baseUrl: cfg.baseUrl || 'http://localhost:1234',
        fetchImpl: cfg.fetchImpl,
      });
  }
};

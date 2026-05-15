import type { FetchLike } from './llm/index.js';
import type { RuntimeMessage } from '@extension/shared';

type LLMFetchResponse = { type: 'LLM_FETCH_RESPONSE'; ok: boolean; status: number; body: string };

/** Routes a fetch through the background service worker. Bypasses CORS / Private Network Access checks that block content-script fetches to localhost or third-party APIs. */
export const backgroundFetch: FetchLike = async (url, init) => {
  if (init.method !== 'POST') throw new Error(`backgroundFetch only supports POST (got ${init.method})`);

  const message: RuntimeMessage = {
    type: 'LLM_FETCH',
    url,
    method: 'POST',
    headers: init.headers,
    body: init.body,
  };

  let resp: LLMFetchResponse | undefined;
  try {
    const respPromise = chrome.runtime.sendMessage(message) as Promise<LLMFetchResponse | undefined>;
    resp = init.signal
      ? await Promise.race([
          respPromise,
          new Promise<never>((_, reject) => {
            init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
              once: true,
            });
          }),
        ])
      : await respPromise;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error(`Background unreachable — try reloading this page. (${(err as Error).message})`);
  }

  if (!resp || typeof resp !== 'object' || !('type' in resp)) {
    throw new Error('Background did not respond. Reload this page after reloading the extension.');
  }

  return {
    ok: resp.ok,
    status: resp.status,
    text: () => Promise.resolve(resp.body),
  };
};

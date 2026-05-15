import type { FetchLike, LLMClient, LLMResponse, Message, ToolCall, ToolSchema } from './types.js';

const defaultFetch: FetchLike = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: init.signal });

type OpenAIMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

const toOpenAIMessages = (messages: Message[]): OpenAIMessage[] =>
  messages.map(m => {
    if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    if (m.role === 'assistant') {
      if (m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.args) },
          })),
        };
      }
      return { role: 'assistant', content: m.content };
    }
    return { role: m.role, content: m.content };
  });

const toOpenAITools = (tools: ToolSchema[]) =>
  tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

const buildChatUrl = (baseUrl: string | undefined): string => {
  const root = (baseUrl || 'https://api.openai.com').replace(/\/$/, '');
  // Accept both "https://host" and "https://host/v1" — strip trailing /v1 to avoid duplication.
  const normalised = root.replace(/\/v1$/, '');
  return `${normalised}/v1/chat/completions`;
};

const createOpenAIClient = (opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  fetchImpl?: FetchLike;
}): LLMClient => ({
  async complete({ messages, tools, signal }) {
    const url = buildChatUrl(opts.baseUrl);
    const doFetch = opts.fetchImpl ?? defaultFetch;
    const res = await doFetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: toOpenAIMessages(messages),
        tools: tools.length ? toOpenAITools(tools) : undefined,
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${text}`);
    const data = JSON.parse(text) as {
      choices: {
        finish_reason: string;
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
    };
    const choice = data.choices[0];
    const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(tc => ({
      id: tc.id,
      name: tc.function.name,
      args: safeParse(tc.function.arguments),
    }));
    const result: LLMResponse = {
      content: choice.message.content ?? '',
      toolCalls,
      finishReason: choice.finish_reason,
    };
    return result;
  },
});

const safeParse = (s: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

export { createOpenAIClient };

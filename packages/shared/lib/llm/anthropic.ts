import type { FetchLike, LLMClient, Message, ToolCall } from './types.js';

const defaultFetch: FetchLike = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers, body: init.body, signal: init.signal });

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

type AnthropicMessage = { role: 'user' | 'assistant'; content: AnthropicContent[] };

const toAnthropicPayload = (messages: Message[]): { system: string | undefined; messages: AnthropicMessage[] } => {
  let system: string | undefined;
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    if (m.role === 'tool') {
      // Anthropic groups tool results under a user message.
      const last = out[out.length - 1];
      const block: AnthropicContent = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      if (last?.role === 'user') last.content.push(block);
      else out.push({ role: 'user', content: [block] });
      continue;
    }
    if (m.role === 'assistant') {
      const content: AnthropicContent[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      out.push({ role: 'assistant', content });
      continue;
    }
    out.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
  }
  return { system, messages: out };
};

export const createAnthropicClient = (opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  fetchImpl?: FetchLike;
}): LLMClient => ({
  async complete({ messages, tools, signal }) {
    const url = `${opts.baseUrl?.replace(/\/$/, '') || 'https://api.anthropic.com'}/v1/messages`;
    const { system, messages: anthMessages } = toAnthropicPayload(messages);
    const doFetch = opts.fetchImpl ?? defaultFetch;
    const res = await doFetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 2048,
        system,
        messages: anthMessages,
        tools: tools.length
          ? tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }))
          : undefined,
      }),
    });
    const responseText = await res.text();
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${responseText}`);
    const data = JSON.parse(responseText) as {
      stop_reason: string;
      content: (
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      )[];
    };
    let content = '';
    const toolCalls: ToolCall[] = [];
    for (const block of data.content) {
      if (block.type === 'text') content += block.text;
      else if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input });
    }
    return { content, toolCalls, finishReason: data.stop_reason };
  },
});

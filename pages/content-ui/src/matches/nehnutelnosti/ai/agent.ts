import { TOOL_SCHEMAS, runTool } from './tools.js';
import type { ToolContext } from './tools.js';
import type { LLMClient, Message } from '@extension/shared';

const DEFAULT_SYSTEM_PROMPT = `You are a real-estate search assistant embedded in a Chrome extension overlaying nehnutelnosti.sk.

The user has loaded a list of property listings in their browser. Your job is to translate their natural-language query into structured tool calls over that list, and return the matching listing IDs plus a short Slovak explanation of what you filtered on.

Always:
1. Call \`filter_listings\` first to narrow the set. Be conservative with implicit constraints — when the user says "lacné" without a number, infer a reasonable threshold from context but state it in your reply.
2. If the user wants top N or ranking, call \`sort_and_limit\` after filtering.
3. If they want a summary or comparison, call \`aggregate\` or \`describe_listings\`.
4. Stop when you have the answer. Maximum 5 tool calls per query.

In your final reply (after tool calls), output a JSON object on a single line with this exact shape:
{"ids": ["site:123", ...], "explanation": "krátke vysvetlenie filtra v slovenčine"}

Slovak place names: "Petržalka", "Ružinov", "Staré Mesto", "Nové Mesto", "Karlova Ves", "Dúbravka", "Lamač" are Bratislava boroughs. "BA" = Bratislava. Match via addressContains.`;

type AgentResult = {
  matchedIds: string[];
  explanation: string;
  /** Raw final assistant message — for debugging. */
  raw: string;
};

type AgentProgress =
  | { phase: 'thinking'; iteration: number }
  | { phase: 'tool'; iteration: number; name: string; args: Record<string, unknown>; resultPreview: string }
  | { phase: 'finalising'; iteration: number };

type ProgressCallback = (step: AgentProgress) => void;

const MAX_ITERATIONS = 5;

const runAgent = async (
  query: string,
  client: LLMClient,
  ctx: ToolContext,
  opts: { systemPrompt?: string; signal?: AbortSignal; onProgress?: ProgressCallback } = {},
): Promise<AgentResult> => {
  const userPreamble = `The user's active list contains ${ctx.listings.length} listings (${ctx.favorites.size} favorited). The available data fields are: id, title, addressRaw, priceEur, areaSqm, coord (geocoded lat/lng), thumbnailUrl, url.\n\nUser query: ${query}`;

  const messages: Message[] = [
    { role: 'system', content: opts.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT },
    { role: 'user', content: userPreamble },
  ];
  const signal = opts.signal;
  const onProgress = opts.onProgress;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    onProgress?.({ phase: 'thinking', iteration: i + 1 });
    const response = await client.complete({ messages, tools: TOOL_SCHEMAS, signal });

    if (response.toolCalls.length === 0) {
      return parseFinalAnswer(response.content);
    }

    messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
    for (const call of response.toolCalls) {
      const result = runTool(call.name, call.args, ctx);
      const serialised = JSON.stringify(result);
      onProgress?.({
        phase: 'tool',
        iteration: i + 1,
        name: call.name,
        args: call.args,
        resultPreview: previewToolResult(call.name, result),
      });
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: serialised });
    }
  }

  onProgress?.({ phase: 'finalising', iteration: MAX_ITERATIONS });
  const finalResponse = await client.complete({ messages, tools: [], signal });
  return parseFinalAnswer(finalResponse.content);
};

const previewToolResult = (name: string, result: unknown): string => {
  if (!result || typeof result !== 'object') return '';
  const r = result as Record<string, unknown>;
  if (name === 'filter_listings' && typeof r.count === 'number') return `${r.count} match`;
  if (name === 'sort_and_limit' && typeof r.count === 'number') return `top ${r.count}`;
  if (name === 'aggregate' && typeof r.count === 'number') return `${r.count} listings`;
  if (name === 'describe_listings' && Array.isArray(r.listings)) return `${r.listings.length} described`;
  return '';
};

const parseFinalAnswer = (raw: string): AgentResult => {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*"ids"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { ids?: unknown; explanation?: unknown };
      const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((x): x is string => typeof x === 'string') : [];
      const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : trimmed;
      return { matchedIds: ids, explanation, raw };
    } catch {
      // fall through
    }
  }
  return { matchedIds: [], explanation: trimmed || 'Žiadne výsledky.', raw };
};

export { DEFAULT_SYSTEM_PROMPT, runAgent };
export type { AgentResult, AgentProgress, ProgressCallback };

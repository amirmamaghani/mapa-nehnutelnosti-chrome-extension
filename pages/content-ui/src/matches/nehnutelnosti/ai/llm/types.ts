export type ToolSchema = {
  name: string;
  description: string;
  /** JSON schema (object) for parameters. */
  parameters: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  /** Parsed JSON arguments. */
  args: Record<string, unknown>;
};

export type Message =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export type LLMResponse = {
  content: string;
  toolCalls: ToolCall[];
  /** Provider-reported finish reason: 'stop' | 'tool_calls' | 'length' | other. */
  finishReason: string;
};

/** Minimal fetch-shaped function. Allows callers to swap globalThis.fetch for a proxy (e.g. routing through a service worker to bypass CORS / Private Network Access). */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface LLMClient {
  /** Single round-trip; agent loop is handled by the caller. */
  complete(input: { messages: Message[]; tools: ToolSchema[]; signal?: AbortSignal }): Promise<LLMResponse>;
}

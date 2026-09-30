export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: WireToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface WireToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export type AiErrorCode = 'unconfigured' | 'config' | 'auth' | 'network' | 'provider' | 'request';

/** One turn streams `text` deltas, then ends with exactly one `done` or `error`. */
export type ChatEvent =
  | { type: 'text'; text: string }
  | {
      type: 'done';
      model: string;
      finishReason: string | null;
      toolCalls: ToolCall[];
      usage: Usage | null;
    }
  | { type: 'error'; code: AiErrorCode; message: string };

export interface AiConfigSummary {
  baseURL: string;
  model: string;
  hasKey: boolean;
  /** Set by LEAF_AI_* environment variables; the settings form is read-only. */
  managed: boolean;
}

export interface AiConfigInput {
  baseURL: string;
  model: string;
  apiKey?: string;
}

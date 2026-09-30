import OpenAI, { APIConnectionError, APIUserAbortError, AuthenticationError } from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources';
import type { AiErrorCode, ChatEvent, ChatRequest, ToolCall, Usage } from '../contract.ts';

export interface ModelSettings {
  baseURL: string;
  model: string;
  apiKey: string;
}

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const ROLES = new Set(['system', 'user', 'assistant', 'tool']);

export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
const invalid = (message: string) => new AiError('request', message);

type Loose = Record<string, unknown> | undefined;

function validateMessage(message: Loose) {
  if (!message || !ROLES.has(message.role as string)) throw invalid('Invalid chat message role');
  const toolCalls = message.role === 'assistant' ? message.tool_calls : undefined;
  if (toolCalls !== undefined) {
    if (!Array.isArray(toolCalls) || !toolCalls.length) throw invalid('Invalid tool calls');
    for (const call of toolCalls as Loose[])
      if (
        typeof call?.id !== 'string' ||
        call.type !== 'function' ||
        typeof (call.function as Loose)?.name !== 'string' ||
        typeof (call.function as Loose)?.arguments !== 'string'
      )
        throw invalid('Invalid tool call');
  }
  if (typeof message.content !== 'string' && !(toolCalls && message.content === null))
    throw invalid('Invalid chat message content');
  if (message.role === 'tool' && typeof message.tool_call_id !== 'string')
    throw invalid('Invalid tool result');
}

function validateTool(tool: Loose) {
  const definition = tool?.function as Loose;
  if (
    tool?.type !== 'function' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test((definition?.name as string) ?? '') ||
    typeof definition?.description !== 'string' ||
    typeof definition.parameters !== 'object'
  )
    throw invalid('Invalid tool definition');
}

/** Checks a renderer request at the process boundary; everything past here trusts its shape. */
export function validateRequest(request: unknown): ChatRequest {
  if (JSON.stringify(request ?? null).length > MAX_REQUEST_BYTES)
    throw invalid('Chat request too large');
  const { messages, tools } = (request ?? {}) as Record<string, unknown>;
  if (!Array.isArray(messages) || !messages.length) throw invalid('Chat request needs messages');
  messages.forEach(validateMessage);
  if (tools !== undefined) {
    if (!Array.isArray(tools)) throw invalid('Invalid tools');
    tools.forEach(validateTool);
  }
  return {
    messages: messages as ChatRequest['messages'],
    tools: (tools as ChatRequest['tools'])?.length ? (tools as ChatRequest['tools']) : undefined,
  };
}

interface ProviderUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
}

function readUsage(usage: ProviderUsage): Usage {
  return {
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    // DeepSeek reports prefix-cache hits separately; OpenAI nests them under details.
    cachedTokens: usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

function classify(error: unknown) {
  if (error instanceof AiError) return error;
  if (error instanceof AuthenticationError)
    return new AiError('auth', `模型服务拒绝了 API Key：${error.message}`);
  if (error instanceof APIConnectionError)
    return new AiError('network', `无法连接模型服务：${error.message}`);
  return new AiError('provider', `模型服务出错：${(error as Error).message}`);
}

/**
 * Streams one chat completion and emits normalized events:
 * `text` deltas, then exactly one `done` (with assembled tool calls) or `error`.
 */
export async function streamChat(
  config: ModelSettings,
  request: unknown,
  signal: AbortSignal,
  emit: (event: ChatEvent) => void,
) {
  try {
    const { messages, tools } = validateRequest(request);
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 2 });
    const stream = await client.chat.completions.create(
      {
        model: config.model,
        // The wire format is validated above and matches the SDK's shape.
        messages: messages as ChatCompletionMessageParam[],
        ...(tools ? { tools: tools as ChatCompletionTool[] } : {}),
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal },
    );
    const calls: ToolCall[] = [];
    let finishReason: string | null = null;
    let usage: Usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
    for await (const chunk of stream) {
      if (chunk.usage) usage = readUsage(chunk.usage);
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.delta?.content) emit({ type: 'text', text: choice.delta.content });
      // Arguments arrive in fragments keyed by index; the id and name arrive once.
      for (const part of choice.delta?.tool_calls ?? []) {
        const call = (calls[part.index] ??= { id: '', name: '', arguments: '' });
        if (part.id) call.id = part.id;
        if (part.function?.name) call.name = part.function.name;
        if (part.function?.arguments) call.arguments += part.function.arguments;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    // The SDK ends iteration quietly on abort, and a dropped connection also ends without a reason.
    if (signal.aborted) return;
    if (!finishReason) throw new AiError('network', '模型服务的回复意外中断');
    emit({
      type: 'done',
      model: config.model,
      finishReason,
      toolCalls: calls.filter(Boolean),
      usage,
    });
  } catch (error) {
    if (error instanceof APIUserAbortError || signal.aborted) return;
    const failure = classify(error);
    emit({ type: 'error', code: failure.code, message: failure.message });
  }
}

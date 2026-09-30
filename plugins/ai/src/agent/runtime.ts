import type { ChatMessage, ChatRequest, ChatResult, ToolCall, ToolSpec, Usage } from './types';
import { fitMessages, clip, messageTokens } from './context';
import { isJsonValue } from '@leaf/shared/types';
import type { JsonObject } from '@leaf/shared/types';

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run(input: Record<string, unknown>, signal: AbortSignal): Promise<string>;
}

/** Bad arguments from the model. The model sees the message and may retry; other errors crash. */
export class ToolInputError extends Error {}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'step' }
  | { type: 'tool'; name: string; input: Record<string, unknown> };

export type ChatFunction = (
  request: ChatRequest,
  options: { signal: AbortSignal; onText?: (delta: string) => void },
) => Promise<ChatResult>;

export interface AgentResult {
  text: string;
  model: string;
  usage: Usage | null;
}
export interface AgentTrace {
  spanId: string;
  parentId: string;
  name: string;
  phase: 'start' | 'complete' | 'failed' | 'cancelled';
  at: number;
  data?: JsonObject;
}

function spec(tool: Tool): ToolSpec {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

async function runTool(
  tools: Tool[],
  call: ToolCall,
  signal: AbortSignal,
  onEvent: (event: AgentEvent) => void,
  onTrace: (event: AgentTrace) => void,
  parentId: string,
) {
  const tool = tools.find((entry) => entry.name === call.name);
  if (!tool) return `错误：没有名为 ${call.name} 的工具`;
  let input: Record<string, unknown>;
  try {
    input = call.arguments.trim() ? JSON.parse(call.arguments) : {};
    if (!input || Array.isArray(input) || typeof input !== 'object' || !isJsonValue(input))
      throw new Error('参数需要是 JSON 对象');
  } catch {
    return `错误：参数不是有效的 JSON：${call.arguments}`;
  }
  onEvent({ type: 'tool', name: tool.name, input });
  const spanId = crypto.randomUUID();
  onTrace({ spanId, parentId, name: `tool.${tool.name}`, phase: 'start', at: Date.now() });
  try {
    const value = clip(await tool.run(input, signal), 4000);
    signal.throwIfAborted();
    onTrace({
      spanId,
      parentId,
      name: `tool.${tool.name}`,
      phase: 'complete',
      at: Date.now(),
      data: { characters: value.length },
    });
    return value;
  } catch (error) {
    onTrace({
      spanId,
      parentId,
      name: `tool.${tool.name}`,
      phase: signal.aborted ? 'cancelled' : 'failed',
      at: Date.now(),
      data: { message: error instanceof Error ? error.message : String(error) },
    });
    if (error instanceof ToolInputError) return `错误：${error.message}`;
    throw error;
  }
}

/**
 * Runs the model/tool loop. The last step offers no tools, so the model has to answer
 * with what it has gathered instead of looping forever.
 */
export async function runAgent({
  chat,
  messages,
  tools,
  maxSteps,
  signal,
  onEvent = () => {},
  onTrace = () => {},
  runId = crypto.randomUUID(),
  contextWindow = 32768,
  outputBudget = 4096,
}: {
  chat: ChatFunction;
  messages: ChatMessage[];
  tools: Tool[];
  maxSteps: number;
  signal: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  onTrace?: (event: AgentTrace) => void;
  runId?: string;
  contextWindow?: number;
  outputBudget?: number;
}): Promise<AgentResult> {
  if (
    !Number.isInteger(contextWindow) ||
    !Number.isInteger(outputBudget) ||
    outputBudget < 1 ||
    outputBudget > 65536 ||
    contextWindow <= outputBudget
  )
    throw new Error('模型上下文与输出预算无效');
  const transcript = [...messages];
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 20)
    throw new Error('Agent 步数需要在 1 到 20 之间');
  let usage: Usage | null = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
  for (let step = 1; ; step++) {
    signal.throwIfAborted();
    const offerTools = step < maxSteps && tools.length > 0;
    if (step > 1) onEvent({ type: 'step' });
    const specs = offerTools ? tools.map(spec) : [],
      prompt = fitMessages(transcript, specs, contextWindow - outputBudget);
    const spanId = crypto.randomUUID();
    onTrace({
      spanId,
      parentId: runId,
      name: 'model.completion',
      phase: 'start',
      at: Date.now(),
      data: { step, estimatedPromptTokens: messageTokens(prompt, specs), outputBudget },
    });
    let result: ChatResult;
    try {
      result = await chat(
        { messages: prompt, maxTokens: outputBudget, ...(offerTools ? { tools: specs } : {}) },
        {
          signal,
          onText: (text) => {
            if (!signal.aborted) onEvent({ type: 'text', text });
          },
        },
      );
      signal.throwIfAborted();
    } catch (error) {
      onTrace({
        spanId,
        parentId: runId,
        name: 'model.completion',
        phase: signal.aborted ? 'cancelled' : 'failed',
        at: Date.now(),
        data: { message: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
    onTrace({
      spanId,
      parentId: runId,
      name: 'model.completion',
      phase: 'complete',
      at: Date.now(),
      data: { model: result.model, usage: result.usage ? { ...result.usage } : null },
    });
    if (!result.usage) usage = null;
    else if (usage) {
      usage.promptTokens += result.usage.promptTokens;
      usage.completionTokens += result.usage.completionTokens;
      usage.cachedTokens += result.usage.cachedTokens;
    }
    if (!result.toolCalls.length) return { text: result.text, model: result.model, usage };
    if (!offerTools) throw new Error('模型在没有提供工具时仍然请求调用工具');
    if (result.toolCalls.length > 16) throw new Error('模型单次请求的工具数量过多');
    transcript.push({
      role: 'assistant',
      content: result.text || null,
      tool_calls: result.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    });
    for (const call of result.toolCalls) {
      const content = await runTool(tools, call, signal, onEvent, onTrace, spanId);
      signal.throwIfAborted();
      transcript.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }
}

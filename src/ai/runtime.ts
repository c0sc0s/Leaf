import type { ChatMessage, ChatRequest, ChatResult, ToolCall, ToolSpec, Usage } from './types';

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
  usage: Usage;
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
) {
  const tool = tools.find((entry) => entry.name === call.name);
  if (!tool) return `错误：没有名为 ${call.name} 的工具`;
  let input: Record<string, unknown>;
  try {
    input = call.arguments.trim() ? JSON.parse(call.arguments) : {};
  } catch {
    return `错误：参数不是有效的 JSON：${call.arguments}`;
  }
  onEvent({ type: 'tool', name: tool.name, input });
  try {
    return await tool.run(input, signal);
  } catch (error) {
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
}: {
  chat: ChatFunction;
  messages: ChatMessage[];
  tools: Tool[];
  maxSteps: number;
  signal: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
}): Promise<AgentResult> {
  const transcript = [...messages];
  const usage: Usage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
  for (let step = 1; ; step++) {
    const offerTools = step < maxSteps && tools.length > 0;
    if (step > 1) onEvent({ type: 'step' });
    const result = await chat(
      { messages: transcript, ...(offerTools ? { tools: tools.map(spec) } : {}) },
      { signal, onText: (text) => onEvent({ type: 'text', text }) },
    );
    usage.promptTokens += result.usage.promptTokens;
    usage.completionTokens += result.usage.completionTokens;
    usage.cachedTokens += result.usage.cachedTokens;
    if (!result.toolCalls.length) return { text: result.text, model: result.model, usage };
    if (!offerTools) throw new Error('模型在没有提供工具时仍然请求调用工具');
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
      const content = await runTool(tools, call, signal, onEvent);
      signal.throwIfAborted();
      transcript.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }
}

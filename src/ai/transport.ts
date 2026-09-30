import {
  AiError,
  type AiConfigInput,
  type AiConfigSummary,
  type ChatEvent,
  type ChatRequest,
  type ChatResult,
} from './types';

async function request<T>(operation: string, input?: unknown): Promise<T> {
  const response = await fetch('/__leaf_ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Leaf-AI': '1' },
    body: JSON.stringify({ operation, input }),
  });
  if (response.status === 404) throw new Error('当前环境没有 AI 服务');
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || 'AI 服务不可用');
  return body.result;
}

export function readAiConfig(): Promise<AiConfigSummary> {
  return window.desktop?.ai ? window.desktop.ai.config() : request('config');
}

export async function saveAiConfig(input: AiConfigInput): Promise<AiConfigSummary> {
  const summary = await (window.desktop?.ai
    ? window.desktop.ai.configure(input)
    : request<AiConfigSummary>('configure', input));
  window.dispatchEvent(new Event('leaf:ai-config'));
  return summary;
}

/** Streams events for one turn until `done` or `error`; aborting the signal cancels the turn. */
function streamEvents(
  body: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const desktop = window.desktop?.ai;
  if (desktop)
    return new Promise((resolve) => {
      const cancel = desktop.chat(body, (event) => {
        onEvent(event);
        if (event.type !== 'text') {
          signal.removeEventListener('abort', stop);
          resolve();
        }
      });
      const stop = () => {
        cancel();
        resolve();
      };
      signal.addEventListener('abort', stop, { once: true });
    });
  return (async () => {
    const response = await fetch('/__leaf_ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Leaf-AI': '1' },
      body: JSON.stringify({ operation: 'chat', input: body }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`AI 服务不可用（${response.status}）`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) if (line) onEvent(JSON.parse(line));
    }
  })();
}

export async function chat(
  body: ChatRequest,
  { signal, onText }: { signal: AbortSignal; onText?: (delta: string) => void },
): Promise<ChatResult> {
  signal.throwIfAborted();
  let text = '';
  let result: ChatResult | undefined;
  let failure: AiError | undefined;
  await streamEvents(
    body,
    (event) => {
      if (event.type === 'text') {
        text += event.text;
        onText?.(event.text);
      } else if (event.type === 'done') result = { ...event, text };
      else failure = new AiError(event.code, event.message);
    },
    signal,
  );
  signal.throwIfAborted();
  if (failure) throw failure;
  if (!result) throw new AiError('network', '模型服务的回复意外中断');
  return result;
}

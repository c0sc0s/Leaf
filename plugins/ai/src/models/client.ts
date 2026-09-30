import type { BackendClient } from '@leaf/contracts/host';
import type { JsonValue } from '@leaf/shared/types';
import { Store } from '@leaf/shared/events';
import {
  AiError,
  type AiConfigSummary,
  type AiConfigInput,
  type ChatEvent,
  type ChatRequest,
  type ChatResult,
} from '../agent/types';

export type ModelConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: AiConfigSummary }
  | { status: 'error'; message: string };
export class ModelClient {
  readonly state = new Store<ModelConfigState>({ status: 'loading' });
  private pending?: Promise<AiConfigSummary>;
  private backend: BackendClient;
  constructor(backend: BackendClient) {
    this.backend = backend;
  }
  load() {
    if (!this.pending) {
      this.pending = this.backend.request('config').then(
        (value) => {
          const config = value as unknown as AiConfigSummary;
          this.state.set({ status: 'ready', config });
          return config;
        },
        (error) => {
          this.state.set({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
          throw error;
        },
      );
      const pending = this.pending;
      void pending
        .finally(() => {
          if (this.pending === pending) this.pending = undefined;
        })
        .catch(() => {});
    }
    return this.pending;
  }
  async configure(input: AiConfigInput) {
    const value = (await this.backend.request(
      'configure',
      input as unknown as JsonValue,
    )) as unknown as AiConfigSummary;
    this.state.set({ status: 'ready', config: value });
    return value;
  }
  chat = async (
    request: ChatRequest,
    { signal, onText }: { signal: AbortSignal; onText?: (text: string) => void },
  ): Promise<ChatResult> => {
    let text = '',
      result: ChatResult | undefined,
      failure: AiError | undefined;
    await this.backend.stream('chat', JSON.parse(JSON.stringify(request)), {
      signal,
      onEvent: (value) => {
        const event = value as unknown as ChatEvent;
        if (event.type === 'text') {
          text += event.text;
          onText?.(event.text);
        } else if (event.type === 'done')
          result = { text, model: event.model, toolCalls: event.toolCalls, usage: event.usage };
        else if (event.type === 'error') failure = new AiError(event.code, event.message);
      },
    });
    signal.throwIfAborted();
    if (failure) throw failure;
    if (!result) throw new AiError('network', '模型服务的回复意外中断');
    return result;
  };
}

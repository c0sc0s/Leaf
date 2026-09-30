import type { BackendClient } from '@leaf/contracts/host';
import type { BackendEvent, BackendRequest } from '@leaf/contracts/transport';
import type { JsonValue } from '@leaf/shared/types';
import { withSignal } from '@leaf/shared/async';

export class BackendTransport implements BackendClient {
  constructor(
    private pluginId: string,
    private lifetime: AbortSignal,
  ) {}
  async request<T extends JsonValue>(
    method: string,
    input?: JsonValue,
    signal?: AbortSignal,
  ): Promise<T> {
    const abort = signal ? AbortSignal.any([signal, this.lifetime]) : this.lifetime;
    abort.throwIfAborted();
    const request: BackendRequest = {
      pluginId: this.pluginId,
      method,
      requestId: crypto.randomUUID(),
      ...(input === undefined ? {} : { input }),
    };
    if (window.desktop) {
      const desktop = window.desktop;
      const cancel = () => desktop.backend.cancel(request.requestId!);
      abort.addEventListener('abort', cancel, { once: true });
      try {
        return (await withSignal(desktop.backend.request(request), abort)) as T;
      } finally {
        abort.removeEventListener('abort', cancel);
      }
    }
    const response = await fetch('/__leaf_backend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Leaf-Backend': '1' },
      body: JSON.stringify({ ...request, stream: false }),
      signal: abort,
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || '插件后台服务不可用');
    return body.result;
  }
  async stream(
    method: string,
    input: JsonValue,
    options: { signal: AbortSignal; onEvent(event: JsonValue): void },
  ): Promise<void> {
    const signal = AbortSignal.any([this.lifetime, options.signal]);
    signal.throwIfAborted();
    const request = { pluginId: this.pluginId, method, input, requestId: crypto.randomUUID() };
    if (window.desktop)
      return new Promise((resolve, reject) => {
        let cancel: () => void = () => {};
        const stop = () => {
          cancel();
          cleanup();
          reject(signal.reason);
        };
        const cleanup = () => signal.removeEventListener('abort', stop);
        cancel = window.desktop!.backend.stream(request, (event) => {
          if (signal.aborted) return;
          if (event.type === 'event') options.onEvent(event.value);
          else {
            cleanup();
            cancel();
            if (event.type === 'error') reject(new Error(event.message));
            else resolve();
          }
        });
        signal.addEventListener('abort', stop, { once: true });
      });
    const response = await fetch('/__leaf_backend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Leaf-Backend': '1' },
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    });
    if (!response.ok || !response.body) throw new Error(`插件后台服务不可用（${response.status}）`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '',
      completed = false;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        if (buffer.length > 8 * 1024 * 1024) throw new Error('插件事件过大');
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines)
          if (line) {
            const event: BackendEvent = JSON.parse(line);
            if (event.type === 'event') options.onEvent(event.value);
            else if (event.type === 'error') throw new Error(event.message);
            else completed = true;
          }
      }
      signal.throwIfAborted();
      if (!completed) throw new Error('插件后台任务意外中断');
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
}

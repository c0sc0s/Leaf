import type { DocumentInteractions } from '@leaf/contracts/documents';
import { Store } from '@leaf/shared/events';

export type PromptRequest = {
  id: string;
  label: string;
  kind: 'password' | 'choice';
  options?: { id: string; label: string }[];
};
export class InteractionsService implements DocumentInteractions {
  readonly state = new Store<PromptRequest | null>(null);
  private queue: { request: PromptRequest; resolve(value: string | null): void }[] = [];
  password(label: string, signal?: AbortSignal) {
    return this.ask({ id: crypto.randomUUID(), kind: 'password', label }, signal);
  }
  choose(label: string, options: { id: string; label: string }[], signal?: AbortSignal) {
    return this.ask({ id: crypto.randomUUID(), kind: 'choice', label, options }, signal);
  }
  finish(value: string | null) {
    this.queue.shift()?.resolve(value);
    this.state.set(this.queue[0]?.request ?? null);
  }
  dispose() {
    for (const entry of this.queue.splice(0)) entry.resolve(null);
    this.state.set(null);
  }
  private ask(request: PromptRequest, signal?: AbortSignal): Promise<string | null> {
    if (signal?.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
      const abort = () => {
        const index = this.queue.findIndex((entry) => entry.request.id === request.id);
        if (index >= 0) this.queue.splice(index, 1)[0].resolve(null);
        this.state.set(this.queue[0]?.request ?? null);
      };
      this.queue.push({
        request,
        resolve: (value) => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
        },
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (this.queue.length === 1) this.state.set(request);
    });
  }
}

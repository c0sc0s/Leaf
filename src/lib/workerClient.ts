export interface WorkerRequest<T> {
  id: number;
  payload: T;
}

export type WorkerResponse<T> = { id: number; value: T } | { id: number; error: string };

// One owner per document/job. Closing it releases both pending work and its caches.
export class WorkerClient<T> {
  private sequence = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: unknown) => void;
      cleanup: () => void;
    }
  >();

  constructor(private worker: Worker) {
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse<unknown>>) => {
      const request = this.pending.get(data.id);
      if (!request) return;
      this.pending.delete(data.id);
      request.cleanup();
      if ('error' in data) request.reject(new Error(data.error));
      else request.resolve(data.value);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.dispose(new Error(event.message || '后台计算失败'));
    };
    worker.onmessageerror = () => this.dispose(new Error('无法读取后台计算结果'));
  }

  run<R>(payload: T, signal?: AbortSignal): Promise<R> {
    if (this.closed) return Promise.reject(new Error('后台计算已关闭'));
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<R>((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => {
        this.pending.delete(id);
        cleanup();
        reject(signal?.reason);
      };
      const cleanup = () => signal?.removeEventListener('abort', abort);
      this.pending.set(id, {
        resolve: (value) => resolve(value as R),
        reject,
        cleanup,
      });
      signal?.addEventListener('abort', abort, { once: true });
      try {
        this.worker.postMessage({ id, payload } satisfies WorkerRequest<T>);
      } catch (error) {
        this.pending.delete(id);
        cleanup();
        reject(error);
      }
    });
  }

  dispose(error: Error = new Error('后台计算已关闭')) {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    for (const request of this.pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    this.pending.clear();
  }
}

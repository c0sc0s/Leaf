export interface WorkerRequest<T> {
  id: number;
  payload: T;
}

export type WorkerResponse<T> = { id: number; value: T } | { id: number; error: string };

export interface WorkerPort {
  send(value: unknown): void;
  listen(
    receive: (value: WorkerResponse<unknown>) => void,
    fail: (error: Error) => void,
  ): { dispose(): void };
  close(): void;
}

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

  private subscription;
  constructor(private worker: WorkerPort) {
    this.subscription = worker.listen(
      (data) => {
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        request.cleanup();
        if ('error' in data) request.reject(new Error(data.error));
        else request.resolve(data.value);
      },
      (error) => this.dispose(error),
    );
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
        this.worker.send({ id, payload } satisfies WorkerRequest<T>);
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
    this.subscription.dispose();
    this.worker.close();
    for (const request of this.pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    this.pending.clear();
  }
}

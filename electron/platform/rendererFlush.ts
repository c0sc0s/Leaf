import { randomUUID } from 'node:crypto';

export class RendererFlush {
  private ready = false;
  private send: (id: string) => void;
  private timeout: number;
  private pending?: {
    id: string;
    promise: Promise<void>;
    finish(error?: Error): void;
  };

  constructor(send: (id: string) => void, timeout = 30000) {
    this.send = send;
    this.timeout = timeout;
  }

  markReady() {
    this.ready = true;
  }

  reset() {
    this.ready = false;
    this.pending?.finish(new Error('保存时阅读窗口已重新加载或关闭，请稍后重试。'));
  }

  flush(): Promise<void> {
    if (this.pending) return this.pending.promise;
    if (!this.ready) return Promise.reject(new Error('阅读窗口尚未准备好保存，请稍后重试。'));
    const id = randomUUID();
    let resolve!: () => void, reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const timer = setTimeout(
      () => this.pending?.finish(new Error('保存未完成，窗口已保留。请稍后重试。')),
      this.timeout,
    );
    this.pending = {
      id,
      promise,
      finish: (error) => {
        clearTimeout(timer);
        this.pending = undefined;
        if (error) reject(error);
        else resolve();
      },
    };
    try {
      this.send(id);
    } catch (error) {
      this.pending.finish(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
  }

  acknowledge(id: unknown, error?: unknown) {
    if (!this.pending || this.pending.id !== id) return;
    this.pending.finish(error ? new Error(String(error)) : undefined);
  }
}

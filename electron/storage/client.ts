import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkerReply, WorkerRequest } from './worker.ts';

// Sources run directly under Node type stripping (Vite, tests); Electron runs compiled output.
const workerFile = new URL(
  `./worker${path.extname(fileURLToPath(import.meta.url))}`,
  import.meta.url,
);

export type Storage = ReturnType<typeof createStorage>;

export function createStorage(root: string) {
  const worker = new Worker(workerFile, { workerData: { root } });
  let sequence = 0;
  let failure: Error | undefined;
  let closing: Promise<unknown> | undefined;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const fail = (error: Error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on('message', (message: WorkerReply) => {
    if ('warning' in message) {
      console.error(`[Leaf] ${message.warning}`);
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if ('error' in message) request.reject(new Error(message.error));
    else request.resolve(message.result);
  });
  worker.on('error', fail);
  worker.on('exit', () => fail(new Error('书库服务已关闭')));
  const send = (operation: string, input?: unknown): Promise<unknown> => {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, operation, input } satisfies WorkerRequest);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  };
  return {
    request(operation: unknown, input?: unknown) {
      if (closing) return Promise.reject(new Error('书库正在关闭'));
      if (typeof operation !== 'string' || operation.startsWith('__'))
        return Promise.reject(new Error('Invalid storage operation'));
      return send(operation, input);
    },
    backup: (destination: string) => send('__backup', destination),
    close() {
      if (!closing) closing = send('__close').finally(() => worker.terminate());
      return closing;
    },
  };
}

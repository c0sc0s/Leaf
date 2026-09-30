import { Worker } from 'node:worker_threads';
import type { BackendProcess, ChildMessage } from './protocol.ts';

export function nodeBackendProcess(file = new URL('./worker.ts', import.meta.url)): BackendProcess {
  const worker = new Worker(file);
  return {
    send: (message) => worker.postMessage(message),
    listen(receive, fail) {
      worker.on('message', (message: ChildMessage) => receive(message));
      worker.on('error', fail);
      worker.on('exit', () => fail(new Error('插件后台进程已退出')));
    },
    async terminate() {
      await worker.terminate();
    },
  };
}

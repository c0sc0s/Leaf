import { WorkerClient } from '@leaf/shared/workers';
import type { WorkerPort } from '@leaf/shared/workers';

export function browserWorker<T>(worker: Worker): WorkerClient<T> {
  const port: WorkerPort = {
    send: (value) => worker.postMessage(value),
    listen: (receive, fail) => {
      worker.onmessage = (event) => receive(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        fail(new Error(event.message || '后台计算失败'));
      };
      worker.onmessageerror = () => fail(new Error('无法读取后台计算结果'));
      return {
        dispose: () => {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
        },
      };
    },
    close: () => worker.terminate(),
  };
  return new WorkerClient<T>(port);
}

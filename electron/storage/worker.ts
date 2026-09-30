import { parentPort, workerData } from 'node:worker_threads';
import { openStorage } from './repositories/index.ts';

export type WorkerRequest = { id: number; operation: string; input?: unknown };
export type WorkerReply =
  { id: number; result?: unknown } | { id: number; error: string } | { warning: string };

const port = parentPort!;
const reply = (message: WorkerReply) => port.postMessage(message);
const library = openStorage(workerData.root);
const collector = setInterval(() => {
  try {
    library.collect();
  } catch (error) {
    reply({ warning: `内容回收失败：${(error as Error).message}` });
  }
}, 30000);
port.on('message', ({ id, operation, input }: WorkerRequest) => {
  try {
    if (operation === '__close') {
      clearInterval(collector);
      library.close();
      reply({ id });
      port.close();
    } else if (operation === '__backup') reply({ id, result: library.backup(input as string) });
    else reply({ id, result: library.requestRaw(operation, input) });
  } catch (error) {
    reply({ id, error: (error as Error).message });
  }
});

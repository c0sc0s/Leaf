import { utilityProcess } from 'electron';
import type { BackendProcess, ChildMessage } from './protocol.ts';

export function electronBackendProcess(file: string): BackendProcess {
  const child = utilityProcess.fork(file, [], {
    serviceName: 'Leaf Plugin',
    stdio: 'pipe',
    env: { NODE_ENV: 'production' },
  });
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.once('exit', () => {
      exited = true;
      resolve();
    }),
  );
  child.stderr?.on('data', (bytes) => console.error(String(bytes)));
  return {
    send(message) {
      if (!exited) child.postMessage(message);
    },
    listen(receive, fail) {
      child.on('message', (message: ChildMessage) => receive(message));
      child.on('error', () => fail(new Error('插件后台进程出错')));
      child.on('exit', () => fail(new Error('插件后台进程已退出')));
    },
    async terminate() {
      if (!exited) child.kill();
      await exit;
    },
  };
}

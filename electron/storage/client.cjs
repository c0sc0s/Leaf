const { Worker } = require('node:worker_threads');
const path = require('node:path');

function createStorage(root) {
  const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: { root } });
  let sequence = 0;
  let failure;
  let closing;
  const pending = new Map();
  const fail = (error) => {
    failure = error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  worker.on('message', ({ id, result, error, warning }) => {
    if (warning) {
      console.error(`[Leaf] ${warning}`);
      return;
    }
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(result);
  });
  worker.on('error', fail);
  worker.on('exit', () => fail(new Error('书库服务已关闭')));
  const send = (operation, input) => {
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ id, operation, input });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  };
  return {
    request(operation, input) {
      if (closing) return Promise.reject(new Error('书库正在关闭'));
      if (typeof operation !== 'string' || operation.startsWith('__'))
        return Promise.reject(new Error('Invalid storage operation'));
      return send(operation, input);
    },
    backup: (destination) => send('__backup', destination),
    close() {
      if (!closing) closing = send('__close').finally(() => worker.terminate());
      return closing;
    },
  };
}

module.exports = { createStorage };

const { parentPort, workerData } = require('node:worker_threads');
const { openLibrary } = require('./library.cjs');
const library = openLibrary(workerData.root);
const collector = setInterval(() => {
  try {
    library.collect();
  } catch (error) {
    parentPort.postMessage({ warning: `内容回收失败：${error.message}` });
  }
}, 30000);
parentPort.on('message', ({ id, operation, input }) => {
  try {
    if (operation === '__close') {
      clearInterval(collector);
      library.close();
      parentPort.postMessage({ id });
      parentPort.close();
    } else if (operation === '__backup')
      parentPort.postMessage({ id, result: library.backup(input) });
    else parentPort.postMessage({ id, result: library.request(operation, input) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});

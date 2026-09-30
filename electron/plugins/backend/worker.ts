import { parentPort as workerPort } from 'node:worker_threads';
import type { BackendHostAPI, BackendPlugin, BackendFactory } from '@leaf/contracts/host';
import type { JsonValue } from '@leaf/shared/types';
import { json, identifier } from '@leaf/contracts/validation';
import type { ParentMessage, ChildMessage } from './protocol.ts';

const utilityPort = (
  process as typeof process & {
    parentPort?: {
      postMessage(message: ChildMessage): void;
      on(event: 'message', callback: (event: { data: ParentMessage }) => void): void;
    };
  }
).parentPort;
const send = (message: ChildMessage) =>
  utilityPort ? utilityPort.postMessage(message) : workerPort!.postMessage(message);
const requests = new Map<
  number,
  { resolve(value: JsonValue | undefined): void; reject(error: Error): void }
>();
const runs = new Map<string, AbortController>();
let sequence = 0,
  plugin: BackendPlugin | undefined,
  closing = false;
function hostCall(method: string, input: JsonValue): Promise<JsonValue | undefined> {
  if (closing) return Promise.reject(new Error('插件后台服务已关闭'));
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    requests.set(id, { resolve, reject });
    send({ type: 'hostCall', id, method, input });
  });
}
async function receive(message: ParentMessage) {
  if (message.type === 'hostResult') {
    const pending = requests.get(message.id);
    if (!pending) return;
    requests.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.value);
    return;
  }
  if (message.type === 'cancel') {
    runs.get(message.id)?.abort();
    return;
  }
  if (message.type === 'close') {
    closing = true;
    for (const controller of runs.values()) controller.abort();
    try {
      await plugin?.dispose();
    } finally {
      send({ type: 'closed' });
    }
    return;
  }
  if (message.type === 'initialize') {
    try {
      const host: BackendHostAPI = {
        storage: {
          get: async (key, documentId) =>
            (await hostCall('storage.get', {
              key,
              ...(documentId ? { documentId } : {}),
            })) as never,
          set: async (key, value, documentId) => {
            await hostCall('storage.set', { key, value, ...(documentId ? { documentId } : {}) });
          },
          delete: async (key, documentId) => {
            await hostCall('storage.delete', { key, ...(documentId ? { documentId } : {}) });
          },
          list: async (prefix, documentId) =>
            (await hostCall('storage.list', { prefix, ...(documentId ? { documentId } : {}) })) as {
              key: string;
              value: JsonValue;
            }[],
        },
        credentials: {
          get: async (key) => (await hostCall('credentials.get', { key })) as string | null,
          set: async (key, value) => {
            await hostCall('credentials.set', { key, value });
          },
        },
        environment: Object.freeze(message.environment),
      };
      const module = (await import(message.moduleURL)) as {
        default: BackendFactory;
      };
      if (typeof module.default !== 'function') throw new Error('插件后台入口无效');
      plugin = await module.default(host);
      send({ type: 'ready' });
    } catch (error) {
      send({ type: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (message.type === 'call') {
    const controller = new AbortController();
    runs.set(message.id, controller);
    try {
      if (!plugin || closing) throw new Error('插件后台服务尚未就绪');
      identifier(message.method);
      if (message.input !== undefined) json(message.input);
      if (message.stream) {
        if (!plugin.stream) throw new Error('插件不支持流式任务');
        await plugin.stream(message.method, message.input ?? null, controller.signal, (value) => {
          if (!controller.signal.aborted)
            send({ type: 'event', id: message.id, value: json(value) });
        });
        controller.signal.throwIfAborted();
        send({ type: 'result', id: message.id });
      } else {
        const value = await plugin.request(message.method, message.input, controller.signal);
        controller.signal.throwIfAborted();
        send({ type: 'result', id: message.id, value: json(value) });
      }
    } catch (error) {
      send({
        type: 'result',
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      runs.delete(message.id);
    }
  }
}
if (utilityPort)
  utilityPort.on('message', ({ data }) => {
    void receive(data);
  });
else
  workerPort!.on('message', (message: ParentMessage) => {
    void receive(message);
  });

import { reportError } from './report';
const pending = new Set<Promise<unknown>>();
const flushers = new Set<() => void | Promise<void>>();
let failure: unknown;
const failedWrites = new Map<string, unknown>();

async function transport<T>(operation: string, input?: unknown): Promise<T> {
  if (window.desktop?.storage)
    return window.desktop.storage.request(operation, input) as Promise<T>;
  const response = await fetch('/__leaf_storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Leaf-Storage': '1' },
    body: JSON.stringify({ operation, input }),
    keepalive: false,
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body.error || 'SQLite 服务不可用');
  return body.result;
}

export function trackStorage<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise);
  void promise.then(
    () => pending.delete(promise),
    (error) => {
      pending.delete(promise);
      failure = error;
      window.dispatchEvent(new CustomEvent('leaf:storage-error', { detail: error }));
    },
  );
  return promise;
}

export function storageRequest<T = void>(operation: string, input?: unknown): Promise<T> {
  const identity = input as
    { id?: string; key?: string; remove?: string[]; restore?: { id: string }[] } | undefined;
  const key =
    operation === 'setPreference'
      ? `preference:${identity?.key}`
      : operation === 'updateBook'
        ? `book:${identity?.id}`
        : operation === 'replaceAnnotations'
          ? `marks:${[...new Set([...(identity?.remove ?? []), ...(identity?.restore ?? []).map((mark) => mark.id)])].sort().join(',')}`
          : undefined;
  const promise = transport<T>(operation, input).catch((error) => {
    reportError(`存储操作失败：${operation}`, error);
    throw error;
  });
  if (key)
    void promise.then(
      () => failedWrites.delete(key),
      (error) => {
        failedWrites.set(key, error);
      },
    );
  if (operation === 'deleteBook')
    void promise.then(
      () => {
        failedWrites.delete(`book:${input}`);
        failedWrites.delete(`preference:folio-position:${input}`);
      },
      () => {},
    );
  return trackStorage(promise);
}

export function registerStorageFlusher(callback: () => void | Promise<void>) {
  flushers.add(callback);
  return () => {
    flushers.delete(callback);
  };
}

export async function flushStorage() {
  failure = undefined;
  for (const flush of flushers) await flush();
  while (pending.size) await Promise.all([...pending]);
  if (failure) throw failure;
  if (failedWrites.size) throw failedWrites.values().next().value;
  await storageRequest('flush');
}

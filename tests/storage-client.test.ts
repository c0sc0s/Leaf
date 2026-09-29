import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const request = vi.fn(async () => undefined as unknown);
beforeEach(() => {
  vi.resetModules();
  request.mockReset();
  vi.stubGlobal('window', { desktop: { storage: { request } }, dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
it('waits for a whole queued operation and close-time save callbacks', async () => {
  const { flushStorage, registerStorageFlusher, trackStorage, storageRequest } =
    await import('../src/lib/storageClient');
  let complete!: () => void;
  const queued = new Promise<void>((resolve) => {
    complete = resolve;
  }).then(() => storageRequest('updateBook', { id: 'book' }));
  trackStorage(queued);
  registerStorageFlusher(() =>
    storageRequest('setPreference', { key: 'folio-settings', value: '{}' }),
  );
  let closed = false;
  const closing = flushStorage().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  complete();
  await closing;
  expect(request.mock.calls.map(([operation]) => operation)).toEqual([
    'setPreference',
    'updateBook',
    'flush',
  ]);
});
it('keeps a failed metadata write visible to shutdown until a successful retry', async () => {
  const { storageRequest, flushStorage } = await import('../src/lib/storageClient');
  request.mockRejectedValueOnce(new Error('disk full'));
  await expect(storageRequest('updateBook', { id: 'book' })).rejects.toThrow('disk full');
  await expect(flushStorage()).rejects.toThrow('disk full');
  await storageRequest('updateBook', { id: 'book' });
  await expect(flushStorage()).resolves.toBeUndefined();
});
it('retries dirty preferences during shutdown rather than discarding an earlier failed save', async () => {
  const { flushStorage } = await import('../src/lib/storageClient');
  const { writePreference, readPreference } = await import('../src/lib/preferences');
  request.mockRejectedValueOnce(new Error('disk full'));
  await expect(writePreference('folio-settings', '{"theme":"dark"}')).rejects.toThrow();
  expect(readPreference('folio-settings')).toBe('{"theme":"dark"}');
  await flushStorage();
  expect(request).toHaveBeenCalledTimes(3);
});

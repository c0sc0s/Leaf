import { expect, it, vi } from 'vitest';
import { PersistenceCoordinator } from '../src/platform/transport/persistence';
it('waits for queued writes and registered close-time flushers', async () => {
  const persistence = new PersistenceCoordinator();
  let complete!: () => void;
  persistence.track(
    new Promise<void>((resolve) => {
      complete = resolve;
    }),
  );
  const flush = vi.fn(async () => {});
  persistence.register(flush);
  let closed = false;
  const closing = persistence.flush().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  complete();
  await closing;
  expect(flush).toHaveBeenCalledOnce();
});
it('retains failed writes until the same key is successfully saved', async () => {
  const persistence = new PersistenceCoordinator();
  await expect(
    persistence.track(Promise.reject(new Error('disk full')), 'document:1'),
  ).rejects.toThrow('disk full');
  await expect(persistence.flush()).rejects.toThrow('未保存');
  await persistence.track(Promise.resolve(), 'document:2');
  await expect(persistence.flush()).rejects.toThrow();
  await persistence.track(Promise.resolve(), 'document:1');
  await expect(persistence.flush()).resolves.toBeUndefined();
});

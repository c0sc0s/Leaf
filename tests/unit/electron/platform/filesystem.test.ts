import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rename } from 'node:fs/promises';
import { renameWithRetry } from '../../../../electron/platform/filesystem.ts';

vi.mock('node:fs/promises', () => ({ rename: vi.fn() }));
vi.mock('node:timers/promises', () => ({
  setTimeout: (delay: number) => new Promise((resolve) => setTimeout(resolve, delay)),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(rename).mockReset();
});
afterEach(() => vi.useRealTimers());

it.each(['EPERM', 'EACCES', 'EBUSY'])('recovers when a directory lock reports %s', async (code) => {
  vi.mocked(rename)
    .mockRejectedValueOnce(Object.assign(new Error('locked'), { code }))
    .mockResolvedValueOnce(undefined);
  const result = renameWithRetry('stage', 'installed');
  await vi.runAllTimersAsync();
  await result;
  expect(rename).toHaveBeenLastCalledWith('stage', 'installed');
  expect(rename).toHaveBeenCalledTimes(2);
});

it('returns permanent errors without retrying', async () => {
  const error = Object.assign(new Error('missing'), { code: 'ENOENT' });
  vi.mocked(rename).mockRejectedValue(error);
  await expect(renameWithRetry('stage', 'installed')).rejects.toBe(error);
  expect(rename).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('stops retrying persistent locks and preserves the original error', async () => {
  const error = Object.assign(new Error('locked'), { code: 'EPERM' });
  vi.mocked(rename).mockRejectedValue(error);
  const result = expect(renameWithRetry('stage', 'installed')).rejects.toBe(error);
  await vi.runAllTimersAsync();
  await result;
  expect(rename).toHaveBeenCalledTimes(9);
});

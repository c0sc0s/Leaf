import { describe, expect, it, vi } from 'vitest';
import { ResourceScope } from '../../src/lifecycle';

describe('resource lifetimes', () => {
  it('aborts before releasing resources in reverse order and shares repeated disposal', async () => {
    const scope = new ResourceScope();
    const released: number[] = [];
    for (const index of [1, 2])
      scope.own({
        async dispose() {
          expect(scope.signal.aborted).toBe(true);
          released.push(index);
        },
      });
    const closing = scope.dispose();
    expect(scope.dispose()).toBe(closing);
    await closing;
    await scope.dispose();
    expect(released).toEqual([2, 1]);
  });

  it('releases the remaining resources even when other disposals fail', async () => {
    const scope = new ResourceScope();
    const first = new Error('first release failed');
    const second = new Error('second release failed');
    const released = vi.fn();
    scope.own({
      dispose: () => {
        throw first;
      },
    });
    scope.own({ dispose: released });
    scope.own({
      dispose: async () => {
        throw second;
      },
    });
    await expect(scope.dispose()).rejects.toMatchObject({ errors: [second, first] });
    expect(released).toHaveBeenCalledOnce();
  });

  it('releases resources arriving after cancellation instead of retaining them', async () => {
    const scope = new ResourceScope();
    await scope.dispose();
    const dispose = vi.fn(async () => {});
    expect(() => scope.own({ dispose })).toThrow('closed');
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from 'vitest';
import { SerialQueue } from '@leaf/shared/async';

describe('serial task queue', () => {
  it('serializes batches, including those added while a previous import is pending', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.enqueue(async () => {
      order.push('first:start');
      await pending;
      order.push('first:end');
      return 1;
    });
    await Promise.resolve();
    const second = queue.enqueue(async () => {
      order.push('second');
      return 2;
    });
    expect(order).toEqual(['first:start']);
    release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('reports failed tasks without losing later batches', async () => {
    const queue = new SerialQueue();
    const failed = queue.enqueue(async () => {
      throw new Error('broken document');
    });
    const later = queue.enqueue(async () => 'next book');
    await expect(failed).rejects.toThrow('broken document');
    await expect(later).resolves.toBe('next book');
  });
});

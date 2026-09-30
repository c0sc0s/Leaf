import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchIndex } from '../plugins/pdf/src/document/searchIndex';
import { BoundedCache } from '@leaf/shared/async';
import { browserWorker } from '@leaf/plugin-sdk/workers';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('resident text index', () => {
  it('searches warmed pages without rereading text and retains canonical offsets', () => {
    const index = new SearchIndex();
    expect(index.search(1, 'needle')).toBeNull();
    expect(index.search(1, 'needle', 'First NEEDLE, then needle.')!.map((r) => r.offset)).toEqual([
      6, 19,
    ]);
    expect(index.search(1, 'then')?.[0]).toMatchObject({ page: 1, offset: 14 });
    expect(index.search(1, '')).toEqual([]);
  });
  it('bounds memory, handles oversized pages and limits empty-page entries', () => {
    const index = new SearchIndex(10, 2);
    index.set(1, 'first');
    index.set(2, 'second');
    expect(index.search(1, 'first')).toBeNull();
    expect(index.search(2, 'second')).toHaveLength(1);
    expect(index.search(3, 'large', 'a large page exceeds the budget')).toHaveLength(1);
    expect(index.search(3, 'large')).toBeNull();
    index.set(3, '');
    index.set(4, '');
    expect(index.search(2, 'second')).toBeNull();
  });
});

it('evicts parsed chapters by weight and recent use', () => {
  const cache = new BoundedCache<string, string>(10, 2);
  cache.set('one', 'first', 5);
  cache.set('two', 'next', 4);
  expect(cache.get('one')).toBe('first');
  cache.set('three', 'last', 4);
  expect(cache.get('two')).toBeUndefined();
  cache.set('huge', 'oversized', 20);
  expect(cache.get('one')).toBe('first');
  expect(cache.get('huge')).toBeUndefined();
});

it('ignores obsolete worker replies and rejects pending requests on shutdown', async () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
  const client = browserWorker<string>(worker);
  const controller = new AbortController();
  const first = client.run('old', controller.signal);
  const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  worker.onmessage!({ data: { id: 1, value: 'obsolete' } } as MessageEvent);
  const second = client.run('new');
  worker.onmessage!({ data: { id: 2, value: 'current' } } as MessageEvent);
  await expect(second).resolves.toBe('current');
  const pending = client.run('unfinished');
  const closed = expect(pending).rejects.toThrow('已关闭');
  client.dispose();
  await closed;
  expect(worker.terminate).toHaveBeenCalledOnce();
});

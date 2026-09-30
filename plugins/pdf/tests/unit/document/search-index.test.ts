import { describe, expect, it } from 'vitest';
import { SearchIndex } from '../../../src/document/searchIndex';
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

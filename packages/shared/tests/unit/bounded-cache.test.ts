import { expect, it } from 'vitest';
import { BoundedCache } from '@leaf/shared/async';
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

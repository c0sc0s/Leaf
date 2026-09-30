import { describe, expect, it } from 'vitest';
import { activeOutlineId } from '../../../src/document/outline';
const items = [
  { title: 'Preface', page: 12, depth: 0 },
  { title: 'Jargon', page: 14, depth: 1 },
  { title: 'Versions', page: 14, depth: 1 },
  { title: 'Conventions', page: 14, depth: 1 },
  { title: 'Part I', page: 20, depth: 0 },
  { title: 'Data model', page: 21, depth: 1 },
  { title: 'Card deck', page: 21, depth: 2, ratio: 0.6 },
].map(({ page, ratio, ...entry }, index) => ({
  ...entry,
  id: String(index),
  locator: {
    documentId: 'book',
    revision: 'revision',
    schema: 'leaf.pdf',
    version: 1,
    payload: { page, ratio: ratio ?? 0 },
  },
}));
const location = (page: number, ratio: number) => ({
  ...items[0].locator,
  payload: { page, ratio },
});
describe('PDF outline locations', () => {
  it('lets the format interpret precise locations and chosen ambiguous destinations', () => {
    expect(activeOutlineId(location(14, 0), items)).toBe('3');
    expect(activeOutlineId(location(14, 0), items, '1')).toBe('1');
    expect(activeOutlineId(location(12, 0.5), items, '1')).toBe('0');
    expect(activeOutlineId(location(21, 0.2), items)).toBe('5');
    expect(activeOutlineId(location(21, 0.58), items)).toBe('6');
    expect(activeOutlineId(location(3, 0), items)).toBe(null);
  });
});

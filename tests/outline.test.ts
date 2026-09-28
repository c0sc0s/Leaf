import { describe, expect, it } from 'vitest';
import { activeOutlineIndex, buildOutline, visibleOutline } from '../src/lib/outline';

const items = [
  { title: 'Preface', page: 12, depth: 0 },
  { title: 'Jargon', page: 14, depth: 1 },
  { title: 'Versions', page: 14, depth: 1 },
  { title: 'Conventions', page: 14, depth: 1 },
  { title: 'Part I', page: 20, depth: 0 },
  { title: 'Data model', page: 21, depth: 1, location: { page: 21, ratio: 0 } },
  { title: 'Card deck', page: 21, depth: 2, location: { page: 21, ratio: 0.6 } },
];

describe('outline', () => {
  it('nests entries by depth', () => {
    const nodes = buildOutline(items);
    expect(nodes.map((n) => n.parent)).toEqual([null, 0, 0, 0, null, 4, 5]);
    expect(nodes.filter((n) => n.hasChildren).map((n) => n.index)).toEqual([0, 4, 5]);
  });

  it('shows only children of expanded entries', () => {
    const nodes = buildOutline(items);
    expect(visibleOutline(nodes, new Set()).map((n) => n.index)).toEqual([0, 4]);
    expect(visibleOutline(nodes, new Set([4])).map((n) => n.index)).toEqual([0, 4, 5]);
    expect(visibleOutline(nodes, new Set([4, 5])).map((n) => n.index)).toEqual([0, 4, 5, 6]);
  });

  it('keeps the chosen entry among several on the same page', () => {
    expect(activeOutlineIndex(items, { page: 14, ratio: 0 }, null)).toBe(3);
    expect(activeOutlineIndex(items, { page: 14, ratio: 0 }, 1)).toBe(1);
    expect(activeOutlineIndex(items, { page: 12, ratio: 0.5 }, 1)).toBe(0);
  });

  it('follows the position within a page when destinations are precise', () => {
    expect(activeOutlineIndex(items, { page: 21, ratio: 0.2 }, null)).toBe(5);
    expect(activeOutlineIndex(items, { page: 21, ratio: 0.58 }, null)).toBe(6);
    expect(activeOutlineIndex(items, { page: 3, ratio: 0 }, null)).toBe(-1);
  });
});

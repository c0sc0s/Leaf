import { describe, expect, it } from 'vitest';
import { buildOutline, visibleOutline } from '../../../src/reading/outline';
const items = [0, 1, 1, 1, 0, 1, 2].map((depth, index) => ({
  id: String(index),
  title: `Entry ${index}`,
  depth,
  locator: {
    documentId: 'example',
    revision: 'r1',
    schema: 'example.tree',
    version: 1,
    payload: String(index),
  },
}));
describe('shared outline', () => {
  it('nests entries and hides descendants of collapsed parents', () => {
    const nodes = buildOutline(items);
    expect(nodes.map((node) => node.parent)).toEqual([null, 0, 0, 0, null, 4, 5]);
    expect(visibleOutline(nodes, new Set()).map((node) => node.index)).toEqual([0, 4]);
    expect(visibleOutline(nodes, new Set([4, 5])).map((node) => node.index)).toEqual([0, 4, 5, 6]);
  });
});

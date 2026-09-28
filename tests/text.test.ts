import { describe, it, expect } from 'vitest';
import { indexText, type RawToken } from '../src/lib/text';
function token(text: string, x: number, y: number, index = 0): RawToken {
  return {
    text,
    x,
    y,
    width: text.length * 6,
    height: 12,
    fontSize: 12,
    fontName: 'test',
    rect: [x, 800 - y - 12, x + text.length * 6, 800 - y],
    originalIndex: index,
  };
}
describe('canonical PDF text index', () => {
  it('preserves source offsets for existing annotations', () => {
    const content = indexText([token('First line', 50, 80), token('Second line', 50, 98)], 1, 600);
    expect(content.text).toBe('First line Second line ');
    expect(content.tokens.map((t) => [t.start, t.end])).toEqual([
      [0, 10],
      [11, 22],
    ]);
  });
  it('preserves tagged logical order without changing source item order', () => {
    const tree = { children: [{ id: 'one' }, { id: 'two' }] };
    const content = indexText(
      [
        { ...token('Second', 50, 50, 0), markedId: 'two' },
        { ...token('First', 50, 200, 1), markedId: 'one' },
      ],
      1,
      600,
      tree,
    );
    expect(content.text).toBe('First Second ');
    expect(content.tokens.map((t) => t.originalIndex)).toEqual([1, 0]);
  });
  it('retains two-column ordering for existing offsets', () => {
    const raw = [];
    for (let i = 0; i < 8; i++)
      raw.push(token(`Left ${i}`, 40, 100 + i * 18), token(`Right ${i}`, 340, 100 + i * 18));
    const content = indexText(raw, 1, 600);
    expect(content.text.indexOf('Left 7')).toBeLessThan(content.text.indexOf('Right 0'));
    expect(content.tokens).toHaveLength(16);
  });
  it('does not invent text on an image-only page', () =>
    expect(indexText([], 1, 600).text).toBe(''));
});

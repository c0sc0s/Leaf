import { describe, it, expect } from 'vitest';
import { reconstruct, tokenRects, type RawToken } from '../src/lib/reflow';
const token = (text: string, x: number, y: number, fontSize = 12, index = 0): RawToken => ({
  text,
  x,
  y,
  width: text.length * 6,
  height: fontSize,
  fontSize,
  fontName: 'test',
  rect: [x, 800 - y - fontSize, x + text.length * 6, 800 - y],
  originalIndex: index,
});
describe('reflow reconstruction', () => {
  it('separates headings and paragraphs while preserving canonical anchors', () => {
    const c = reconstruct(
      [
        token('Chapter One', 50, 30, 24),
        token('A first line', 50, 80),
        token('continues here.', 50, 97),
        token('A new paragraph.', 50, 140),
      ],
      1,
      595,
    );
    expect(c.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect(c.blocks[1].text).toBe('A first line continues here.');
    for (const b of c.blocks) expect(c.text.slice(b.start, b.end)).toBe(b.text);
    expect(c.warnings[0]).toContain('语义标签');
  });
  it('reads persistent two-column gutters column by column', () => {
    const raw = [];
    for (let i = 0; i < 8; i++) {
      raw.push(token(`Left ${i}`, 40, 100 + i * 18));
      raw.push(token(`Right ${i}`, 340, 100 + i * 18));
    }
    const c = reconstruct(raw, 1, 600);
    expect(c.columns).toBe(2);
    expect(c.text.indexOf('Left 7')).toBeLessThan(c.text.indexOf('Right 0'));
    expect(c.tokens).toHaveLength(16);
  });
  it('does not turn short single-column text into two columns', () => {
    const c = reconstruct([token('Short line', 50, 80), token('Indented', 330, 100)], 1, 600);
    expect(c.columns).toBe(1);
  });
  it('uses tagged PDF structure order and heading roles', () => {
    const first = { ...token('First', 50, 200), markedId: 'one' };
    const second = { ...token('Second', 50, 50), markedId: 'two' };
    const tree = {
      role: 'Root',
      children: [
        { role: 'H1', children: [{ type: 'content', id: 'one' }] },
        { role: 'P', children: [{ type: 'content', id: 'two' }] },
      ],
    };
    const c = reconstruct([second, first], 1, 600, tree);
    expect(c.text).toBe('First Second ');
    expect(c.blocks[0].type).toBe('heading');
    expect(c.tagged).toBe(true);
  });
  it('builds proportional PDF rectangles for partial-token selections', () => {
    const c = reconstruct([token('abcdefghij', 50, 100)], 1, 595);
    expect(tokenRects(c, 2, 5)).toEqual([[62, 688, 80, 700]]);
  });
  it('detects image-only pages without inventing text', () => {
    const c = reconstruct([], 2, 595);
    expect(c.text).toBe('');
    expect(c.blocks).toEqual([]);
    expect(c.warnings[0]).toContain('OCR');
  });
});
it('uses shared OCR baselines so short lowercase words keep their reading order', () => {
  const raw = [
    { ...token('Reading', 50, 100), baseline: 130 },
    { ...token('a', 120, 116), baseline: 130 },
    { ...token('book', 135, 105), baseline: 130 },
  ];
  expect(reconstruct(raw, 1, 595, null, 'ocr').text).toBe('Reading a book ');
});

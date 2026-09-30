import { describe, expect, it } from 'vitest';
import { atmosphereBackground, extractPalette } from '../../../../src/app/library/coverPalette';

function cover(width: number, height: number, paint: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set([...paint(x, y), 255], (y * width + x) * 4);
  return data;
}

describe('cover palette', () => {
  it('ranks a vivid accent above the plain paper that fills most of the cover', () => {
    const data = cover(20, 30, (x, y) => (x >= 12 && y >= 20 ? [224, 48, 61] : [251, 250, 246]));
    const [first] = extractPalette(data, 20, 30);
    expect(Math.min(first.hue, 360 - first.hue)).toBeLessThan(10);
    expect(first.saturation).toBeGreaterThan(0.6);
    expect(first.x).toBeGreaterThan(0.6);
    expect(first.y).toBeGreaterThan(0.6);
  });
  it('rejects pixel data that does not match its dimensions', () => {
    expect(() => extractPalette(new Uint8ClampedArray(8), 4, 4)).toThrow();
  });
  it('keeps the atmosphere within a readable lightness band for each theme', () => {
    const palette = extractPalette(
      cover(10, 10, () => [250, 250, 250]),
      10,
      10,
    );
    const lightness = (css: string) =>
      [...css.matchAll(/hsl\(\d+ \d+% (\d+)%/g)].map((match) => Number(match[1]));
    expect(Math.min(...lightness(atmosphereBackground(palette, false)))).toBeGreaterThanOrEqual(76);
    expect(Math.max(...lightness(atmosphereBackground(palette, true)))).toBeLessThanOrEqual(40);
  });
});

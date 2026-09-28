import { describe, expect, it } from 'vitest';
import { parseLayout, sameSpread, spreadStart } from '../src/lib/layout';

describe('reading layout', () => {
  it('migrates the single mode string saved by earlier versions', () => {
    expect(parseLayout('continuous')).toEqual({ continuous: true, spread: false });
    expect(parseLayout('single')).toEqual({ continuous: false, spread: false });
    expect(parseLayout('spread')).toEqual({ continuous: false, spread: true });
    expect(parseLayout(undefined)).toEqual({ continuous: true, spread: false });
    expect(parseLayout({ continuous: true, spread: true })).toEqual({
      continuous: true,
      spread: true,
    });
  });

  it('pairs pages from the first page when showing spreads', () => {
    const spread = { continuous: false, spread: true };
    expect(spreadStart(4, spread)).toBe(3);
    expect(sameSpread(5, 6, spread)).toBe(true);
    expect(sameSpread(6, 7, spread)).toBe(false);
    expect(sameSpread(6, 7, { continuous: false, spread: false })).toBe(false);
  });
});

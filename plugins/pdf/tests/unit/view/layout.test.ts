import { describe, expect, it } from 'vitest';
import { parseLayout, sameSpread, spreadStart } from '../../../src/view/layout';

describe('reading layout', () => {
  it('validates independent continuous and spread settings', () => {
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

import { describe, expect, it } from 'vitest';
import {
  arrangeSlots,
  fitWidth,
  PAGE_GAP,
  READABLE_PAGE_WIDTH,
} from '../src/features/reader/viewport/geometry';

const portrait = { width: 600, height: 800 };
const continuous = { continuous: true, spread: false };
const spread = { continuous: true, spread: true };

describe('fitWidth', () => {
  it('fills narrow windows and caps wide ones at a readable measure', () => {
    expect(fitWidth(500, continuous)).toBe(500);
    expect(fitWidth(3000, continuous)).toBe(READABLE_PAGE_WIDTH);
    expect(fitWidth(3000, spread)).toBe(READABLE_PAGE_WIDTH * 2 + PAGE_GAP);
  });
});

describe('arrangeSlots', () => {
  it('stacks single pages with a gap and scales height to the page aspect', () => {
    const slots = arrangeSlots(2, new Map(), portrait, 600, 1, continuous);
    expect(slots).toEqual([
      { page: 1, top: PAGE_GAP, width: 600, height: 800 },
      { page: 2, top: PAGE_GAP * 2 + 800, width: 600, height: 800 },
    ]);
  });

  it('pairs pages in spread mode and sizes each row by its taller page', () => {
    const sizes = new Map([[2, { width: 600, height: 1200 }]]);
    const slots = arrangeSlots(3, sizes, portrait, 616, 1, spread);
    expect(slots.map((s) => [s.page, s.top, s.width])).toEqual([
      [1, PAGE_GAP, 300],
      [2, PAGE_GAP, 300],
      [3, PAGE_GAP * 2 + 600, 300],
    ]);
  });

  it('keeps every page at the top of the stage when paging instead of scrolling', () => {
    const slots = arrangeSlots(3, new Map(), portrait, 600, 1, {
      continuous: false,
      spread: false,
    });
    expect(slots.every((slot) => slot.top === PAGE_GAP)).toBe(true);
  });

  it('applies zoom to width and height alike', () => {
    const [slot] = arrangeSlots(1, new Map(), portrait, 600, 1.5, continuous);
    expect(slot.width).toBe(900);
    expect(slot.height).toBe(1200);
  });
});

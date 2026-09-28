import type { ReadingLayout } from '../../../types';

export interface PageSize {
  width: number;
  height: number;
}

/** Where one page sits in the scrolling stage, in CSS pixels. */
export interface Slot extends PageSize {
  page: number;
  top: number;
}

// Fitting wider than this makes lines too long to read and shows only a sliver of the page.
export const READABLE_PAGE_WIDTH = 920;
export const PAGE_GAP = 16;

/** The width a row of pages fills at 100% zoom, capped at a readable measure. */
export function fitWidth(available: number, layout: ReadingLayout) {
  return Math.min(
    available,
    layout.spread ? READABLE_PAGE_WIDTH * 2 + PAGE_GAP : READABLE_PAGE_WIDTH,
  );
}

/**
 * Lays pages out in rows (two per row in spread mode). Pages whose size is not known yet use
 * `fallback` so the document has a stable height before every page has been measured.
 */
export function arrangeSlots(
  count: number,
  sizes: ReadonlyMap<number, PageSize>,
  fallback: PageSize,
  fit: number,
  zoom: number,
  layout: ReadingLayout,
): Slot[] {
  const perRow = layout.spread ? 2 : 1;
  const width = (layout.spread ? (fit - PAGE_GAP) / 2 : fit) * zoom;
  const slots: Slot[] = [];
  let top = PAGE_GAP;
  for (let first = 1; first <= count; first += perRow) {
    let rowHeight = 0;
    for (let page = first; page < first + perRow && page <= count; page++) {
      const size = sizes.get(page) ?? fallback;
      const height = (size.height / size.width) * width;
      rowHeight = Math.max(rowHeight, height);
      slots.push({ page, top: layout.continuous ? top : PAGE_GAP, width, height });
    }
    top += rowHeight + PAGE_GAP;
  }
  return slots;
}

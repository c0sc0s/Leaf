import type { ReadingLayout } from '../types';

export const defaultLayout: ReadingLayout = { continuous: true, spread: false };

export function parseLayout(value: unknown): ReadingLayout {
  if (value && typeof value === 'object') {
    const { continuous, spread } = value as Partial<ReadingLayout>;
    return { continuous: continuous !== false, spread: spread === true };
  }
  return defaultLayout;
}

export function pageStep(layout: ReadingLayout) {
  return layout.spread ? 2 : 1;
}

export function spreadStart(page: number, layout: ReadingLayout) {
  return layout.spread ? Math.floor((page - 1) / 2) * 2 + 1 : page;
}

export function sameSpread(a: number, b: number, layout: ReadingLayout) {
  return spreadStart(a, layout) === spreadStart(b, layout);
}

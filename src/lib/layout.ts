import type { ReadingLayout } from '../types';

export const defaultLayout: ReadingLayout = { continuous: true, spread: false };

// Versions up to 1.4 stored a single mode string; "spread" implied paged reading.
const legacy: Record<string, ReadingLayout> = {
  continuous: { continuous: true, spread: false },
  single: { continuous: false, spread: false },
  spread: { continuous: false, spread: true },
};

export function parseLayout(value: unknown): ReadingLayout {
  if (typeof value === 'string') return legacy[value] ?? defaultLayout;
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

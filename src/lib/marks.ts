import type { MarkColor } from '../types';

/** Display colour for each annotation colour; also written into exported PDF annotations. */
export const markColors = {
  amber: '#e9b84d',
  green: '#72b49a',
  blue: '#79a7dc',
  pink: '#d994ad',
} as const satisfies Record<MarkColor, string>;

export const markColorNames = {
  amber: '黄色',
  green: '绿色',
  blue: '蓝色',
  pink: '粉色',
} as const satisfies Record<MarkColor, string>;

export const isMarkColor = (value: unknown): value is MarkColor =>
  typeof value === 'string' && value in markColors;

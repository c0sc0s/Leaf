import type { OutlineItem } from '@/lib/outline';

/**
 * A rough count that errs high: one token per CJK character, four Latin characters per token.
 * Compatible services tokenize differently, so the exact count comes back in `usage`.
 */
export function estimateTokens(text: string) {
  let wide = 0;
  for (const char of text) if (char.codePointAt(0)! >= 0x2e80) wide++;
  return wide + Math.ceil((text.length - wide) / 4);
}

/** Cuts text to about `maxTokens`, keeping the part around `focus` (a character offset). */
export function clip(text: string, maxTokens: number, focus = 0) {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;
  const length = Math.floor((text.length * maxTokens) / tokens);
  const start = Math.max(0, Math.min(text.length - length, focus - Math.floor(length / 2)));
  const end = start + length;
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function passageAround(text: string, start: number, end: number, radius: number) {
  const from = Math.max(0, start - radius);
  const to = Math.min(text.length, end + radius);
  return (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : '');
}

const MARKUP = new Set(['*', '_', '`', '~', '#', '>']);

/** Text without Markdown emphasis marks and with collapsed whitespace, mapped back to source offsets. */
function plainText(text: string) {
  let plain = '';
  const offsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (MARKUP.has(char)) continue;
    const space = /\s/.test(char);
    if (space && (!plain || plain.endsWith(' '))) continue;
    plain += space ? ' ' : char;
    offsets.push(i);
  }
  return { plain, offsets };
}

/** Finds a rendered selection in Markdown source, whose markup differs from what was displayed. */
export function findQuote(text: string, quote: string): { start: number; end: number } | null {
  const needle = plainText(quote).plain.trim();
  if (!needle) return null;
  const { plain, offsets } = plainText(text);
  // Links and other inline syntax can break a long match; a shorter prefix still locates it.
  for (const probe of [needle, needle.slice(0, 40), needle.slice(0, 12)]) {
    const at = plain.indexOf(probe);
    if (at < 0) continue;
    const last = Math.min(offsets.length - 1, at + needle.length - 1);
    return { start: offsets[at], end: offsets[last] + 1 };
  }
  return null;
}

export interface Section {
  /** Outline titles from the top level down to the section holding the page. */
  path: string[];
  first: number;
  last: number;
}

/**
 * The section holding `page` is the last outline entry starting at or before it, and runs to
 * the page where the next entry starts, since sections often end partway down that page.
 */
export function sectionOf(outline: OutlineItem[], page: number, pageCount: number): Section {
  let index = -1;
  outline.forEach((item, position) => {
    if (item.page <= page) index = position;
  });
  if (index < 0)
    return {
      path: [],
      first: 1,
      last: outline.length ? Math.max(page, outline[0].page) : pageCount,
    };
  const path = [outline[index].title];
  for (let depth = outline[index].depth, i = index - 1; i >= 0 && depth > 0; i--)
    if (outline[i].depth < depth) {
      path.unshift(outline[i].title);
      depth = outline[i].depth;
    }
  const next = outline[index + 1];
  return {
    path,
    first: outline[index].page,
    last: next ? Math.min(pageCount, Math.max(page, next.page)) : pageCount,
  };
}

/** Pages ordered by distance from `page`, so trimming to a budget keeps the nearest context. */
export function pagesOutward(page: number, first: number, last: number) {
  const order = [page];
  for (let step = 1; page + step <= last || page - step >= first; step++) {
    if (page + step <= last) order.push(page + step);
    if (page - step >= first) order.push(page - step);
  }
  return order;
}

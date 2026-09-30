import type { OutlineItem } from '@/lib/outline';
import type { MarkdownChapter, PageContent } from '@/types';
import { findQuote } from './context';

export interface TextAnchor {
  page: number;
  start: number;
  end: number;
  quote: string;
}

export type DocumentUnit = 'page' | 'chapter';

/** What the AI layer reads from an open book, independent of its format. */
export interface DocumentSource {
  title: string;
  author: string;
  unit: DocumentUnit;
  /** Number of pages, or chapters for Markdown. */
  length: number;
  outline(): OutlineItem[];
  text(page: number): Promise<string>;
  /** The anchor's character range within `text(anchor.page)`, if it can be found. */
  locate(anchor: TextAnchor): Promise<{ start: number; end: number } | null>;
}

export function unitLabel(unit: DocumentUnit, page: number) {
  return unit === 'page' ? `第 ${page} 页` : `第 ${page} 章`;
}

export function citationTag(unit: DocumentUnit, page: number) {
  return unit === 'page' ? `[p.${page}]` : `[ch.${page}]`;
}

interface BookIdentity {
  title: string;
  author: string;
}

export function createPdfSource({
  book,
  pages,
  getContent,
  outline,
}: {
  book: BookIdentity;
  pages: number;
  getContent: (page: number) => Promise<PageContent>;
  outline: () => OutlineItem[];
}): DocumentSource {
  // The viewer's page cache is small; whole-book search needs every page's text at once.
  const texts = new Map<number, string>();
  return {
    title: book.title,
    author: book.author,
    unit: 'page',
    length: pages,
    outline,
    async text(page) {
      let value = texts.get(page);
      if (value === undefined) {
        value = (await getContent(page)).text;
        texts.set(page, value);
      }
      return value;
    },
    locate: async ({ start, end }) => ({ start, end }),
  };
}

export function createMarkdownSource(
  book: BookIdentity,
  chapters: MarkdownChapter[],
): DocumentSource {
  const outline = chapters.map((chapter, index) => ({
    title: chapter.title,
    page: index + 1,
    depth: 0,
  }));
  return {
    title: book.title,
    author: book.author,
    unit: 'chapter',
    length: chapters.length,
    outline: () => outline,
    text: async (page) => chapters[page - 1].content,
    // Selections are offsets into rendered text, so find the quote in the Markdown source instead.
    locate: async ({ page, quote }) => findQuote(chapters[page - 1].content, quote),
  };
}

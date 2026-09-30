import { describe, expect, it } from 'vitest';
import {
  clip,
  estimateTokens,
  findQuote,
  pagesOutward,
  passageAround,
  sectionOf,
} from '../src/ai/context';
import { askContext, askMessages, citedPage, linkCitations } from '../src/ai/ask';
import { createMarkdownSource, type DocumentSource } from '../src/ai/document';
import { searchBook } from '../src/ai/bookTools';

const outline = [
  { title: 'Part I', page: 1, depth: 0 },
  { title: 'Chapter 1', page: 2, depth: 1 },
  { title: '1.1 Attention', page: 3, depth: 2 },
  { title: '1.2 Memory', page: 7, depth: 2 },
  { title: 'Chapter 2', page: 10, depth: 1 },
];

function pdfLike(pages: string[], items = outline): DocumentSource {
  return {
    title: 'Book',
    author: 'Ada',
    unit: 'page',
    length: pages.length,
    outline: () => items,
    text: async (page) => pages[page - 1],
    locate: async ({ start, end }) => ({ start, end }),
  };
}

describe('context helpers', () => {
  it('counts CJK characters individually and Latin text by four characters', () => {
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('注意力机制')).toBe(5);
  });

  it('clips around the focus and marks both cuts', () => {
    const text = 'a'.repeat(400) + 'FOCUS' + 'b'.repeat(400);
    const result = clip(text, 20, 402);
    expect(result).toContain('FOCUS');
    expect(result.startsWith('…') && result.endsWith('…')).toBe(true);
    expect(clip('short', 20)).toBe('short');
  });

  it('finds the section, its ancestors and where the next heading starts', () => {
    expect(sectionOf(outline, 5, 20)).toEqual({
      path: ['Part I', 'Chapter 1', '1.1 Attention'],
      first: 3,
      last: 7,
    });
    expect(sectionOf(outline, 12, 20)).toEqual({
      path: ['Part I', 'Chapter 2'],
      first: 10,
      last: 20,
    });
    expect(sectionOf([], 4, 9)).toEqual({ path: [], first: 1, last: 9 });
  });

  it('orders pages by distance so a budget keeps the nearest ones', () => {
    expect(pagesOutward(5, 3, 7)).toEqual([5, 6, 4, 7, 3]);
    expect(pagesOutward(3, 3, 5)).toEqual([3, 4, 5]);
  });

  it('finds rendered quotes in Markdown source despite inline markup', () => {
    const source = 'Intro.\n\nThe **key idea** is that\nattention is all you need.';
    const found = findQuote(source, 'The key idea is that attention');
    expect(source.slice(found!.start, found!.end)).toBe('The **key idea** is that\nattention');
    expect(findQuote(source, 'attention is all you need')?.start).toBe(source.indexOf('attention'));
    expect(findQuote(source, 'missing words')).toBeNull();
    expect(passageAround('0123456789', 4, 6, 2)).toBe('…234567…');
  });
});

describe('ask prompt', () => {
  it('includes the selection, nearby passage and the whole section when it fits', async () => {
    const pages = Array.from({ length: 12 }, (_, i) => `page ${i + 1} text`);
    pages[4] = 'before the quoted words after';
    const context = await askContext(pdfLike(pages), {
      page: 5,
      start: 11,
      end: 23,
      quote: 'quoted words',
    });
    expect(context).toContain('Part I › Chapter 1 › 1.1 Attention');
    expect(context).toContain('<selection>\nquoted words\n</selection>');
    expect(context).toContain('before the quoted words after');
    expect(context).toContain('当前章节的原文');
    for (const page of [3, 4, 5, 6, 7]) expect(context).toContain(`[p.${page}]`);
    expect(context).not.toContain('[p.8]');
  });

  it('keeps only pages near the selection when the section exceeds its budget', async () => {
    const pages = Array.from({ length: 40 }, () => 'x'.repeat(8000));
    const context = await askContext(pdfLike(pages, []), {
      page: 20,
      start: 0,
      end: 1,
      quote: 'x',
    });
    expect(context).toContain('read_pages');
    expect(context).toContain('[p.20]');
    expect(context).not.toContain('[p.1]\n');
  });

  it('puts the context on the first kept question and drops the oldest turns first', () => {
    const long = '长'.repeat(3500);
    const turns = [
      { role: 'user' as const, content: 'q1' },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: 'q2' },
      { role: 'assistant' as const, content: long },
      { role: 'user' as const, content: 'q3' },
    ];
    const messages = askMessages('system', 'CONTEXT', turns);
    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(messages[1].content).toBe('CONTEXT\n\n读者的问题：q2');
    expect(() => askMessages('system', 'CONTEXT', turns.slice(0, 2))).toThrow();
  });

  it('turns page and chapter citations into jump links', () => {
    expect(linkCitations('见 [p.12] 与 [p.3-4]。', 'page')).toBe(
      '见 [第 12 页](#leaf-cite-12) 与 [第 3–4 页](#leaf-cite-3)。',
    );
    expect(linkCitations('[ch.2]', 'chapter')).toBe('[第 2 章](#leaf-cite-2)');
    expect(citedPage('#leaf-cite-7')).toBe(7);
    expect(citedPage('https://example.com')).toBeNull();
  });
});

describe('book tools', () => {
  it('searches every chapter case-insensitively and cites where each hit is', async () => {
    const source = createMarkdownSource({ title: 'T', author: '' }, [
      { path: 'a.md', title: 'A', content: 'Transformers use Attention.' },
      { path: 'b.md', title: 'B', content: 'Nothing here.' },
      { path: 'c.md', title: 'C', content: 'Self-attention again.' },
    ]);
    const result = await searchBook(source, 'attention', new AbortController().signal);
    expect(result.split('\n')).toEqual([
      '[ch.1] …Transformers use Attention.…',
      '[ch.3] …Self-attention again.…',
    ]);
    expect(await searchBook(source, 'absent', new AbortController().signal)).toContain('没有找到');
  });
});

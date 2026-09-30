import type { Root } from 'hast';
import type { RenderedMark, MarkdownChapter } from '../types';
import { browserWorker } from '@leaf/plugin-sdk/workers';
import type { MarkdownRequest, MarkdownSearchResult } from './markdownEngine';
import type { MarkdownOutlineItem } from './markdownOutline';

export interface MarkdownDocument {
  render(page: number, query: string, marks: RenderedMark[], signal?: AbortSignal): Promise<Root>;
  outline(signal?: AbortSignal): Promise<MarkdownOutlineItem[]>;
  search(query: string, signal?: AbortSignal): Promise<MarkdownSearchResult[]>;
  text(page: number, signal?: AbortSignal): Promise<string>;
  dispose(): void;
}

// Keep transport details here; React consumes document operations with fixed types.
export async function openMarkdownDocument(
  chapters: MarkdownChapter[],
  signal?: AbortSignal,
): Promise<MarkdownDocument> {
  const client = browserWorker<MarkdownRequest>(
    new Worker(new URL('./markdown.worker.ts', import.meta.url), { type: 'module' }),
  );
  try {
    await client.run<boolean>({ type: 'init', chapters }, signal);
  } catch (error) {
    client.dispose();
    throw error;
  }
  return {
    render: (page, query, marks, signal) =>
      client.run<Root>({ type: 'render', page, query, marks }, signal),
    outline: (signal) => client.run<MarkdownOutlineItem[]>({ type: 'outline' }, signal),
    search: (query, signal) =>
      client.run<MarkdownSearchResult[]>({ type: 'search', query }, signal),
    text: (page, signal) => client.run<string>({ type: 'text', page }, signal),
    dispose: () => client.dispose(),
  };
}

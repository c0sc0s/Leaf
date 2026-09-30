import { browserWorker } from '@leaf/plugin-sdk/workers';
import type { SearchRequest, SearchResult } from './searchIndex';

export interface PDFSearchIndex {
  search(
    page: number,
    query: string,
    text?: string,
    signal?: AbortSignal,
  ): Promise<SearchResult[] | null>;
  dispose(): void;
}

export function createPDFSearchIndex(): PDFSearchIndex {
  const client = browserWorker<SearchRequest>(
    new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }),
  );
  return {
    search: (page, query, text, signal) =>
      client.run<SearchResult[] | null>({ page, query, text }, signal),
    dispose: () => client.dispose(),
  };
}

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageContent } from '../../../types';
import type { ReadingScheduler } from '../../../lib/scheduler';
import type { SearchResult } from '../../../lib/searchIndex';
import { createPDFSearchIndex, type PDFSearchIndex } from '../pdfSearchService';

export type { SearchResult } from '../../../lib/searchIndex';

const RESULT_BATCH = 20;

export function useDocumentSearch(
  pdf: PDFDocumentProxy | null,
  getContent: (page: number) => Promise<PageContent>,
  scheduler: ReadingScheduler,
  notify: (message: string) => void,
) {
  const [query, setQuery] = useState('');
  const [completedQuery, setCompletedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [activeMatch, setActiveMatch] = useState<{ page: number; offset: number } | null>(null);
  const epoch = useRef(0);
  const index = useRef<PDFSearchIndex | null>(null);
  useEffect(() => {
    // Start lazily on the first query and release the index when the PDF closes.
    return () => {
      index.current?.dispose();
      index.current = null;
    };
  }, [pdf]);
  useEffect(() => {
    const current = ++epoch.current;
    setCompletedQuery(null);
    setResults([]);
    setActiveMatch(null);
    if (!query.trim() || !pdf) {
      setProgress(null);
      return;
    }
    setProgress(0);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const found: SearchResult[] = [];
      try {
        index.current ??= createPDFSearchIndex();
        const worker = index.current;
        for (let n = 1; n <= pdf.numPages; n++) {
          if (current !== epoch.current) return;
          await scheduler.checkpoint(controller.signal);
          if (current !== epoch.current) return;
          let matches = await worker.search(n, query, undefined, controller.signal);
          if (matches === null) {
            const content = await getContent(n);
            controller.signal.throwIfAborted();
            matches = await worker.search(n, query, content.text, controller.signal);
          }
          for (const match of matches || []) found.push(match);
          if (n % RESULT_BATCH === 0 || n === pdf.numPages) {
            setResults([...found]);
            setProgress(n / pdf.numPages);
          }
        }
        if (current === epoch.current) {
          setProgress(null);
          setCompletedQuery(query);
        }
      } catch (e) {
        if (current === epoch.current) {
          setProgress(null);
          notify('搜索未完成：' + String(e));
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
      epoch.current++;
    };
  }, [query, pdf, getContent, scheduler, notify]);
  return { query, setQuery, results, progress, activeMatch, setActiveMatch, completedQuery };
}

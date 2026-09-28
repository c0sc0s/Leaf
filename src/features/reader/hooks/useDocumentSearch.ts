import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageContent } from '../../../types';
import type { ReadingScheduler } from '../../../lib/scheduler';

const RESULT_BATCH = 20;

export interface SearchResult {
  page: number;
  excerpt: string;
  count: number;
  offset: number;
}

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
    const timer = setTimeout(async () => {
      const found: SearchResult[] = [];
      const needle = query.toLowerCase();
      try {
        for (let n = 1; n <= pdf.numPages; n++) {
          if (current !== epoch.current) return;
          await scheduler.checkpoint();
          if (current !== epoch.current) return;
          const content = await getContent(n);
          if (current !== epoch.current) return;
          const text = content.text.toLowerCase();
          let pos = text.indexOf(needle);
          while (pos >= 0) {
            found.push({
              page: n,
              count: 1,
              offset: pos,
              excerpt:
                (pos > 35 ? '…' : '') +
                content.text.slice(Math.max(0, pos - 35), pos + query.length + 80) +
                '…',
            });
            pos = text.indexOf(needle, pos + needle.length);
          }
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
      epoch.current++;
    };
  }, [query, pdf, getContent, scheduler, notify]);
  return { query, setQuery, results, progress, activeMatch, setActiveMatch, completedQuery };
}

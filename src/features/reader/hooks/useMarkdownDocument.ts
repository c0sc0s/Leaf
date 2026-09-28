import { useEffect, useState } from 'react';
import type { Root } from 'hast';
import type { Annotation, MarkdownChapter } from '@/types';
import { openMarkdownDocument, type MarkdownDocument } from '../markdownService';
import type { MarkdownSearchResult } from '../markdownEngine';
import type { MarkdownOutlineItem } from '../markdownOutline';

export function useMarkdownDocument(
  chapters: MarkdownChapter[],
  page: number,
  query: string,
  marks: Annotation[],
  notify: (message: string) => void,
) {
  const [session, setSession] = useState<MarkdownDocument | null>(null);
  const [rendered, setRendered] = useState<{
    page: number;
    tree: Root;
    query: string;
    marks: Annotation[];
  } | null>(null);
  const [outline, setOutline] = useState<MarkdownOutlineItem[]>([]);
  const [results, setResults] = useState<MarkdownSearchResult[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let client: MarkdownDocument | undefined;
    setSession(null);
    setRendered(null);
    setOutline([]);
    setError('');
    void openMarkdownDocument(chapters, controller.signal)
      .then((document) => {
        client = document;
        if (controller.signal.aborted) document.dispose();
        else setSession(document);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => {
      controller.abort();
      client?.dispose();
    };
  }, [chapters]);

  useEffect(() => {
    if (!session || !chapters[page - 1]) return;
    const controller = new AbortController();
    void session
      .render(page, query, marks, controller.signal)
      .then((tree) => {
        setRendered({ page, tree, query, marks });
        setError('');
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(String(failure));
      });
    return () => controller.abort();
  }, [session, chapters, page, query, marks]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void session
      .outline(controller.signal)
      .then(setOutline)
      .catch(() => {
        if (!controller.signal.aborted) notify('目录未能加载');
      });
    return () => controller.abort();
  }, [session, notify]);

  // Search is independently debounced; changing input never parses the book again.
  useEffect(() => {
    setResults([]);
    if (!session || !query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void session
        .search(query, controller.signal)
        .then(setResults)
        .catch(() => {
          if (!controller.signal.aborted) notify('搜索未完成，请重试');
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, query, notify]);

  return {
    tree: rendered?.page === page ? rendered.tree : null,
    outline,
    results,
    error,
    ready: rendered?.page === page && rendered.query === query && rendered.marks === marks,
  };
}

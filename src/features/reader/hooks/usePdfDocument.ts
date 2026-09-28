import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Book, PageContent } from '../../../types';
import { extractPage, loadPDF } from '../../../lib/pdf';
import { resolveDestination } from '../../../lib/destination';
import type { OutlineItem } from '../../../lib/outline';

type NativeOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>;

async function readOutline(pdf: PDFDocumentProxy): Promise<OutlineItem[]> {
  const native = await pdf.getOutline().catch(() => null);
  if (!native) return [];
  const items: OutlineItem[] = [];
  async function walk(entries: NativeOutline, depth: number) {
    for (const entry of entries) {
      const location = await resolveDestination(pdf, entry.dest).catch(() => null);
      items.push({
        title: entry.title,
        page: location?.page ?? 1,
        depth,
        location: location ?? undefined,
      });
      if (entry.items.length) await walk(entry.items, depth + 1);
    }
  }
  await walk(native, 0);
  return items;
}

export function usePdfDocument(book: Book, askPassword: () => Promise<string | null>) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineReady, setOutlineReady] = useState(false);
  const [pageLabels, setPageLabels] = useState<string[] | null>(null);
  const cache = useRef(new Map<number, Promise<PageContent>>());
  useEffect(() => {
    let current: PDFDocumentProxy | undefined;
    let task: ReturnType<typeof loadPDF> | undefined;
    let disposed = false;
    void book.blob
      .arrayBuffer()
      .then((data) => {
        if (disposed) return;
        task = loadPDF(data, (update) => {
          void askPassword().then((password) => {
            if (password !== null && !disposed) update(password);
            else void task?.destroy();
          });
        });
        return task.promise;
      })
      .then(async (p) => {
        if (!p) return;
        current = p;
        if (disposed) {
          await p.loadingTask.destroy();
          return;
        }
        setPdf(p);
        void p
          .getPageLabels()
          .then((labels) => {
            if (!disposed) setPageLabels(labels);
          })
          .catch(() => {});
        const items = await readOutline(p);
        if (!disposed) {
          setOutline(items);
          setOutlineReady(true);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e instanceof Error ? e.message : '无法打开 PDF');
      });
    return () => {
      disposed = true;
      cache.current.clear();
      void (current?.loadingTask.destroy() || task?.destroy());
    };
  }, [book.id, book.blob, askPassword]);
  const getContent = useCallback(
    (n: number) => {
      if (!pdf) return Promise.reject(new Error('PDF 尚未加载'));
      let value = cache.current.get(n);
      if (value) {
        cache.current.delete(n);
        cache.current.set(n, value);
      }
      if (!value) {
        value = extractPage(pdf, n);
        cache.current.set(n, value);
        if (cache.current.size > 30) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined && oldest !== n) cache.current.delete(oldest);
        }
        const pending = value;
        value.catch(() => {
          if (cache.current.get(n) === pending) cache.current.delete(n);
        });
      }
      return value;
    },
    [pdf],
  );
  return { pdf, error, outline, outlineReady, pageLabels, getContent };
}

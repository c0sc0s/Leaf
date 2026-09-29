import { lazy, Suspense } from 'react';
import type { Book, Settings } from '../../types';

const loadPDFReader = () => import('./Reader').then((module) => ({ default: module.Reader }));
const loadMarkdownReader = () =>
  import('./MarkdownReader').then((module) => ({ default: module.MarkdownReader }));
const PDFReader = lazy(loadPDFReader);
const MarkdownReader = lazy(loadMarkdownReader);

/**
 * Fetches both readers once the browser is idle, so the first book opened does not wait
 * for code. Returns a function that cancels the pending fetch.
 */
export function preloadReadersWhenIdle() {
  const handle = requestIdleCallback(
    () => {
      void loadPDFReader();
      void loadMarkdownReader();
    },
    { timeout: 2000 },
  );
  return () => cancelIdleCallback(handle);
}

export interface ReaderProps {
  book: Book;
  settings: Settings;
  dark: boolean;
  onClose: () => void;
  onUpdate: (book: Book) => void;
  onSettings: () => void;
  notify: (message: string) => void;
}

/** The reader stays hidden while its first screen draws; see readerReady. */
export function BookReader(props: ReaderProps & { askPassword: () => Promise<string | null> }) {
  return (
    <Suspense fallback={null}>
      {props.book.format === 'markdown' ? <MarkdownReader {...props} /> : <PDFReader {...props} />}
    </Suspense>
  );
}

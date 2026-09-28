import { lazy, Suspense } from 'react';
import type { Book, Settings } from '../../types';
import { Spinner } from '../../components/UI';

const PDFReader = lazy(() => import('./Reader').then((module) => ({ default: module.Reader })));
const MarkdownReader = lazy(() =>
  import('./MarkdownReader').then((module) => ({ default: module.MarkdownReader })),
);

export interface ReaderProps {
  book: Book;
  settings: Settings;
  dark: boolean;
  onClose: () => void;
  onUpdate: (book: Book) => void;
  onSettings: () => void;
  notify: (message: string) => void;
}

export function BookReader(props: ReaderProps & { askPassword: () => Promise<string | null> }) {
  return (
    <Suspense fallback={<Spinner text="正在打开书籍…" />}>
      {props.book.format === 'markdown' ? <MarkdownReader {...props} /> : <PDFReader {...props} />}
    </Suspense>
  );
}

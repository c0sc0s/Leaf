import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../../types';
import { storage } from '../../lib/db';

const INITIALIZED_KEY = 'folio-initialized';

async function installSamples() {
  const [{ importPDF }, manifest] = await Promise.all([
    import('../../lib/pdf'),
    fetch('./samples/manifest.json').then((r) => r.json() as Promise<{ slug: string }[]>),
  ]);
  const samples: Book[] = [];
  for (const entry of manifest) {
    const response = await fetch(`./samples/${entry.slug}.pdf`);
    if (!response.ok) throw new Error(`示例文件加载失败：${entry.slug}`);
    const file = await response.blob();
    const book = {
      ...(await importPDF(file, entry.slug + '.pdf')),
      sample: true,
      addedAt: Date.now() - samples.length * 1000,
    };
    await storage.addBook(book, file);
    samples.push(book);
  }
  localStorage.setItem(INITIALIZED_KEY, '1');
  return samples;
}

// Shared across StrictMode's double mount so samples are installed once.
let initialLoad: Promise<Book[]> | undefined;
function loadLibrary() {
  if (!initialLoad) {
    initialLoad = storage
      .books()
      .then((books) =>
        books.length || localStorage.getItem(INITIALIZED_KEY) ? books : installSamples(),
      );
    // A failed load may be retried on the next mount.
    initialLoad.catch(() => (initialLoad = undefined));
  }
  return initialLoad;
}

/** Owns the book list and note counts, keeping React state and IndexedDB in step. */
export function useLibrary(notify: (message: string) => void) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const refreshNoteCounts = useCallback(() => {
    void storage
      .annotations()
      .then((marks) => {
        const next: Record<string, number> = {};
        for (const mark of marks) next[mark.bookId] = (next[mark.bookId] ?? 0) + 1;
        setNoteCounts(next);
      })
      .catch((error) => notify(`无法读取笔记：${String(error)}`));
  }, [notify]);
  useEffect(() => {
    void loadLibrary()
      .then(setBooks)
      .catch((error) => notify(`书库加载失败：${String(error)}`))
      .finally(() => setLoading(false));
    refreshNoteCounts();
  }, [notify, refreshNoteCounts]);
  const updateBook = useCallback(
    (book: Book) => {
      setBooks((previous) => previous.map((b) => (b.id === book.id ? book : b)));
      void storage
        .putBook(book)
        .catch((error) => notify(`保存失败，请检查本机存储空间：${String(error)}`));
    },
    [notify],
  );
  const addBook = useCallback(async (book: Book, file: Blob) => {
    await storage.addBook(book, file);
    setBooks((previous) => [book, ...previous]);
  }, []);
  const removeBook = useCallback(async (book: Book) => {
    await storage.deleteBook(book.id);
    setBooks((previous) => previous.filter((b) => b.id !== book.id));
  }, []);
  return { books, loading, noteCounts, refreshNoteCounts, updateBook, addBook, removeBook };
}

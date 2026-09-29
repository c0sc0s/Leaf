import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, BookMetadata } from '../../types';
import { storage } from '../../lib/db';
import { bookMetadata } from '../../lib/bookData';
import { initializeLibrary } from './initializeLibrary';

export const openingLabel = (title: string) => `正在打开 ${title}…`;
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function useLibrary(notify: (message: string) => void) {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [active, setActive] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // One book read ahead while the pointer rests on it, so the click only waits for rendering.
  const prefetched = useRef<{ id: string; book: Promise<Book | null> } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const openRevision = useRef(0);

  const refreshCounts = useCallback(() => {
    void storage
      .annotationCounts()
      .then(setCounts)
      .catch(() => notify('无法读取笔记'));
  }, [notify]);

  useEffect(() => {
    let disposed = false;
    void initializeLibrary()
      .then((loaded) => {
        if (!disposed)
          setBooks((current) => {
            const combined = new Map(loaded.map((book) => [book.id, book]));
            for (const book of current) combined.set(book.id, book);
            return [...combined.values()];
          });
      })
      .catch((error) => {
        if (!disposed) notify('书库加载失败：' + String(error));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    refreshCounts();
    return () => {
      disposed = true;
      openRevision.current++;
    };
  }, [notify, refreshCounts]);

  const prefetchBook = useCallback((id: string) => {
    if (prefetched.current?.id === id) return;
    const book = storage.book(id);
    // A failed read ahead surfaces when the book is actually opened.
    book.catch(() => {});
    prefetched.current = { id, book };
  }, []);

  const openBook = useCallback(
    async (metadata: BookMetadata) => {
      const revision = ++openRevision.current;
      setOpeningId(metadata.id);
      try {
        // Let the pressed book paint its loading state before storage and the reader
        // take over the main thread.
        await nextFrame();
        await nextFrame();
        const read =
          prefetched.current?.id === metadata.id
            ? prefetched.current.book
            : storage.book(metadata.id);
        prefetched.current = null;
        const book = await read;
        if (revision !== openRevision.current) return;
        if (!book) throw new Error('这本书已从书库移除');
        setActive(book);
      } catch (error) {
        if (revision === openRevision.current) notify('无法打开书籍：' + String(error));
      } finally {
        if (revision === openRevision.current) setOpeningId(null);
      }
    },
    [notify],
  );

  const closeReader = useCallback(() => {
    openRevision.current++;
    setOpeningId(null);
    setActive(null);
    refreshCounts();
  }, [refreshCounts]);

  const updateBook = useCallback(
    (book: BookMetadata) => {
      const metadata = bookMetadata(book);
      if (prefetched.current?.id === book.id) prefetched.current = null;
      setBooks((current) => current.map((entry) => (entry.id === book.id ? metadata : entry)));
      // Retain the loaded content and its identity while only metadata changes.
      setActive((current) => (current?.id === book.id ? { ...current, ...metadata } : current));
      void storage.updateBook(metadata).catch(() => notify('保存失败，请检查本机存储空间'));
    },
    [notify],
  );

  const addBook = useCallback(async (book: Book) => {
    await storage.putBook(book);
    const metadata = bookMetadata(book);
    setBooks((current) => [metadata, ...current.filter((entry) => entry.id !== book.id)]);
  }, []);

  const removeBook = useCallback(
    async (id: string) => {
      try {
        if (prefetched.current?.id === id) prefetched.current = null;
        await storage.deleteBook(id);
        setBooks((current) => current.filter((entry) => entry.id !== id));
        refreshCounts();
        notify('已从书库移除');
        return true;
      } catch {
        notify('无法移除这本书');
        return false;
      }
    },
    [notify, refreshCounts],
  );

  return {
    books,
    active,
    loading,
    openingId,
    prefetchBook,
    counts,
    openBook,
    closeReader,
    updateBook,
    addBook,
    removeBook,
  };
}

import { useCallback, useEffect, useRef } from 'react';
import type { Book } from '../../../types';

// Progress is written once reading settles rather than on every page turn.
const PROGRESS_SAVE_DELAY = 1000;

/**
 * Records the current page and last-opened time on the book, debounced while reading and
 * flushed when the page is hidden or the reader closes.
 */
export function useReadingProgress(
  book: Book,
  page: number,
  opened: boolean,
  onUpdate: (book: Book) => void,
) {
  const latest = useRef({ book, page });
  latest.current = { book, page };
  const save = useCallback(
    () => onUpdate({ ...latest.current.book, page: latest.current.page, openedAt: Date.now() }),
    [onUpdate],
  );
  useEffect(() => {
    if (!opened) return;
    const timer = setTimeout(save, PROGRESS_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [opened, page, save]);
  useEffect(() => {
    if (!opened) return;
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [opened, save]);
}

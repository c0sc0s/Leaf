import { useCallback, useRef, useState } from 'react';
import type { Book, ReadingLocation, ReadingState } from '../../../types';

/** Page bookmarks for a book, each remembering the exact spot it was placed at. */
export function useBookmarks(
  book: Book,
  page: number,
  captureCurrent: () => ReadingState,
  onUpdate: (book: Book) => void,
) {
  const [bookmarks, setBookmarks] = useState<number[]>(book.bookmarks ?? []);
  const bookRef = useRef(book);
  bookRef.current = book;
  const bookmarked = bookmarks.includes(page);
  const toggleBookmark = useCallback(() => {
    const next = bookmarked
      ? bookmarks.filter((n) => n !== page)
      : [...bookmarks, page].sort((a, b) => a - b);
    setBookmarks(next);
    const { [page]: _removed, ...kept } = bookRef.current.bookmarkLocations ?? {};
    const bookmarkLocations: Record<number, ReadingLocation> = bookmarked
      ? kept
      : { ...kept, [page]: captureCurrent() };
    onUpdate({ ...bookRef.current, bookmarks: next, bookmarkLocations });
  }, [bookmarked, bookmarks, page, captureCurrent, onUpdate]);
  const locationOf = useCallback((n: number) => bookRef.current.bookmarkLocations?.[n], []);
  return { bookmarks, bookmarked, toggleBookmark, locationOf };
}

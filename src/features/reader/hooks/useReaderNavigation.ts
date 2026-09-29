import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import type { Book, ReadingLayout, ReadingLocation, ReadingState } from '../../../types';
import { initialReadingState } from '../../../lib/position';
import { pageStep } from '../../../lib/layout';
import { useReadingPersistence } from './useReadingPersistence';
import type { PDFViewportHandle } from '../viewport/PDFViewport';
import { createLocationStore } from './locationStore';
import { stepZoom } from '../zoom';

const HISTORY_LIMIT = 50;

/**
 * Owns where the reader is: page, precise location, zoom and layout, the back-history of
 * jumps, and persisting that position so the book reopens at the same spot.
 */
export function useReaderNavigation(
  book: Book,
  viewer: RefObject<PDFViewportHandle | null>,
  notify: (message: string) => void,
  opened: boolean,
  onUpdate: (book: Book) => void,
) {
  const saved = useMemo(() => initialReadingState(book), [book.id]);
  const [locationStore] = useState(() => createLocationStore(saved));
  const [history, setHistory] = useState<ReadingState[]>([]);
  const [page, setPage] = useState(saved.page);
  const [jump, setJump] = useState({ ...saved, revision: 0 });
  const [zoom, setZoom] = useState(saved.zoom);
  const [layout, setLayout] = useState<ReadingLayout>(saved.layout);

  const pageRef = useRef(page);
  pageRef.current = page;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const locationRef = useRef<ReadingLocation>(saved);
  const bookRef = useRef(book);
  bookRef.current = book;
  const schedulePersistence = useReadingPersistence({
    bookId: book.id,
    page,
    enabled: opened,
    capture: () => ({
      ...locationRef.current,
      page: pageRef.current,
      zoom: zoomRef.current,
      layout: layoutRef.current,
    }),
    onProgress: (page, openedAt) => onUpdate({ ...bookRef.current, page, openedAt }),
    notify,
  });

  const captureCurrent = useCallback((): ReadingState => {
    const location = viewer.current?.capture();
    if (location) locationRef.current = location;
    return { ...locationRef.current, zoom: zoomRef.current, layout: layoutRef.current };
  }, [viewer]);
  const remember = (state: ReadingState) =>
    setHistory((items) => [...items.slice(-(HISTORY_LIMIT - 1)), state]);

  const handleLocation = useCallback(
    (location: ReadingLocation) => {
      locationRef.current = location;
      locationStore.set(location);
      if (pageRef.current !== location.page) {
        pageRef.current = location.page;
        setPage(location.page);
      }
      schedulePersistence();
    },
    [schedulePersistence, locationStore],
  );
  const navigate = useCallback(
    (n: number, location?: ReadingLocation, rememberCurrent = true) => {
      const previous = captureCurrent();
      if (rememberCurrent) remember(previous);
      pageRef.current = Math.max(1, Math.min(book.pages, n));
      const target = { page: pageRef.current, ratio: 0, xRatio: 0, screenY: 24, ...location };
      locationRef.current = target;
      setPage(pageRef.current);
      setJump((j) => ({
        ...target,
        zoom: zoomRef.current,
        layout: layoutRef.current,
        revision: j.revision + 1,
      }));
    },
    [book.pages, captureCurrent],
  );
  const navigateToPage = useCallback((n: number) => navigate(n), [navigate]);
  const turnPage = useCallback(
    (direction: 1 | -1) => navigate(pageRef.current + direction * pageStep(layoutRef.current)),
    [navigate],
  );
  const returnToPrevious = useCallback(() => {
    const target = history.at(-1);
    if (!target) return;
    setHistory((items) => items.slice(0, -1));
    setZoom(target.zoom);
    setLayout(target.layout);
    navigate(target.page, target, false);
  }, [history, navigate]);
  const changeLayout = useCallback(
    (next: ReadingLayout) => {
      const current = captureCurrent();
      remember(current);
      setLayout(next);
      setJump((j) => ({ ...current, layout: next, revision: j.revision + 1 }));
    },
    [captureCurrent],
  );
  const zoomIn = useCallback(() => setZoom((z) => stepZoom(z, 1)), []);
  const zoomOut = useCallback(() => setZoom((z) => stepZoom(z, -1)), []);
  const resetZoom = useCallback(() => setZoom(1), []);

  return {
    page,
    jump,
    zoom,
    setZoom,
    layout,
    locationStore,
    canReturn: history.length > 0,
    captureCurrent,
    handleLocation,
    navigate,
    navigateToPage,
    turnPage,
    returnToPrevious,
    changeLayout,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}

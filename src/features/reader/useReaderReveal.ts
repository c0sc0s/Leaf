import { useEffect, useRef, useState } from 'react';
import type { Book } from '../../types';
import { whenReaderReady } from './readerReady';

/**
 * Keeps the reader for `active` hidden in a stage until its first screen is drawn and the
 * opening state has been visible for at least `minimumMs`, so opening a book shows one
 * loading state instead of each loading step in turn.
 *
 * @param active The book whose reader is mounted, or null on the shelf.
 * @param openingId The book being fetched before `active` is set, or null.
 * @param minimumMs The shortest time the opening state stays up, measured from the click.
 * @returns `stage`, to attach to the element wrapping the reader; `shown`, whether the
 *   reader is visible; and `openingId`, the book to show as opening until it is.
 */
export function useReaderReveal(active: Book | null, openingId: string | null, minimumMs: number) {
  const stage = useRef<HTMLDivElement>(null);
  const openedAt = useRef(0);
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = !!active && shownId === active.id;

  useEffect(() => {
    if (openingId) openedAt.current = performance.now();
  }, [openingId]);

  useEffect(() => {
    if (!active) return setShownId(null);
    if (shownId === active.id || !stage.current) return;
    let timer = 0;
    const stopWaiting = whenReaderReady(stage.current, () => {
      const remaining = minimumMs - (performance.now() - openedAt.current);
      timer = window.setTimeout(() => setShownId(active.id), Math.max(0, remaining));
    });
    return () => {
      stopWaiting();
      window.clearTimeout(timer);
    };
  }, [active, shownId, minimumMs]);

  return {
    stage,
    shown,
    openingId: openingId ?? (active && !shown ? active.id : null),
  };
}

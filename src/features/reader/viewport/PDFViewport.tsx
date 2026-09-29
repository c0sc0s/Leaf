import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, PageContent, ReadingLocation, ReadingLayout } from '../../../types';
import { captureLocation, restoreLocation } from '../../../lib/position';
import { resolveDestination, type Destination } from '../../../lib/destination';
import { sameSpread } from '../../../lib/layout';
import { capturePDFSelection, type DocumentSelection, type PageText } from '../../../lib/selection';
import { PDFPage } from './PDFPage';
import { PageSkeleton } from '../PageSkeleton';
import { arrangeSlots, fitWidth, PAGE_GAP, type PageSize, type Slot } from './geometry';
export interface PDFViewportHandle {
  capture: () => ReadingLocation;
}
interface Props {
  pdf: PDFDocumentProxy;
  getContent: (page: number) => Promise<PageContent>;
  marks: Annotation[];
  activeMarkId: string | null;
  zoom: number;
  layout: ReadingLayout;
  dark: boolean;
  query: string;
  activeMatch: { page: number; offset: number } | null;
  onMarkClick: (mark: { id: string; x: number; y: number } | null) => void;
  onNavigate: (page: number, location?: ReadingLocation) => void;
  jump: ReadingLocation & { revision: number };
  onLocation: (location: ReadingLocation) => void;
  onSelection: (selection: DocumentSelection | null) => void;
  onError: (message: string) => void;
}
/** The vertical band of the stage worth rendering; quantised so small scrolls keep it stable. */
interface ScrollBand {
  top: number;
  bottom: number;
}
const NO_MARKS: Annotation[] = [];
function sameBand(a: ScrollBand | null, b: ScrollBand) {
  return !!a && a.top === b.top && a.bottom === b.bottom;
}
export const PDFViewport = forwardRef<PDFViewportHandle, Props>(function PDFViewport(
  {
    pdf,
    getContent,
    marks,
    zoom,
    layout,
    dark,
    query,
    jump,
    activeMatch,
    activeMarkId,
    onMarkClick,
    onNavigate,
    onLocation,
    onSelection,
    onError,
  },
  ref,
) {
  const root = useRef<HTMLDivElement>(null);
  const [dragPage, setDragPage] = useState<number | null>(null);
  useEffect(() => {
    const container = root.current!.parentElement!;
    let dragging = false,
      y = 0,
      x = 0,
      raf = 0,
      previous = 0;
    const tick = (now: number) => {
      if (!dragging) return;
      const box = container.getBoundingClientRect(),
        edge = 48;
      const direction =
        y < box.top + edge
          ? -Math.min(1, (box.top + edge - y) / edge)
          : y > box.bottom - edge
            ? Math.min(1, (y - box.bottom + edge) / edge)
            : 0;
      if (direction) {
        container.scrollTop += direction * 7 * Math.min(2, (now - previous || 16) / 16);
        const caret = document.caretRangeFromPoint(
          Math.max(box.left + 2, Math.min(box.right - 2, x)),
          Math.max(box.top + 2, Math.min(box.bottom - 2, y)),
        );
        if (caret && root.current?.contains(caret.startContainer))
          window.getSelection()?.extend(caret.startContainer, caret.startOffset);
      }
      previous = now;
      raf = requestAnimationFrame(tick);
    };
    const down = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (event.button || event.detail > 1 || !target.closest('.textLayer')) return;
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (!caret || !root.current?.contains(caret.startContainer)) return;
      // Native drag autoscroll would add a second, unbounded scroll on top of our edge controller.
      event.preventDefault();
      const selection = window.getSelection();
      if (event.shiftKey && selection?.rangeCount)
        selection.extend(caret.startContainer, caret.startOffset);
      else {
        selection?.removeAllRanges();
        selection?.addRange(caret);
      }
      dragging = true;
      x = event.clientX;
      y = event.clientY;
      previous = 0;
      setDragPage(Number(target.closest<HTMLElement>('.pdf-paper')!.dataset.page));
      raf = requestAnimationFrame(tick);
    };
    const move = (event: MouseEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (dragging) {
        event.preventDefault();
        const box = container.getBoundingClientRect();
        const caret = document.caretRangeFromPoint(
          Math.max(box.left + 2, Math.min(box.right - 2, x)),
          Math.max(box.top + 2, Math.min(box.bottom - 2, y)),
        );
        if (caret && root.current?.contains(caret.startContainer))
          window.getSelection()?.extend(caret.startContainer, caret.startOffset);
      }
    };
    const up = () => {
      dragging = false;
      cancelAnimationFrame(raf);
      setTimeout(() => setDragPage(null), 0);
    };
    container.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
    };
  }, []);
  const openDestination = useCallback(
    (dest: Destination) =>
      void resolveDestination(pdf, dest)
        .then((location) => location && onNavigate(location.page, location))
        .catch((error) => onError(String(error))),
    [pdf, onNavigate, onError],
  );
  const [available, setAvailable] = useState(0);
  const fit = fitWidth(available, layout);
  const [displayPage, setDisplayPage] = useState(jump.page);
  const layoutModeRef = useRef(layout);
  layoutModeRef.current = layout;
  const displayPageRef = useRef(displayPage);
  displayPageRef.current = displayPage;
  const [sizes, setSizes] = useState<Map<number, PageSize>>(new Map());
  const [contents, setContents] = useState<Map<number, PageContent>>(new Map());
  // Only the band of pages worth rendering is state; scroll frames inside it cause no render.
  const [range, setRange] = useState<ScrollBand | null>(null);
  const frames = useRef(new Map<number, PageText>());
  const anchor = useRef<ReadingLocation>(jump);
  const pending = useRef<ReadingLocation | null>(jump);
  const revision = useRef(jump.revision);
  const navigating = useRef(true);
  const displayed = useRef(false);
  const activePage = useRef(jump.page);
  const initial = useRef(jump);
  const callbacks = useRef({ onLocation, onError });
  callbacks.current = { onLocation, onError };
  const slotsRef = useRef<Slot[]>([]);
  const readySize = useRef(new Map<number, PageSize>());
  const capture = useCallback(
    () =>
      pending.current ||
      (root.current?.parentElement &&
        captureLocation(root.current.parentElement, activePage.current)) ||
      anchor.current,
    [],
  );
  useImperativeHandle(ref, () => ({ capture }), [capture]);
  const updateRange = useCallback(() => {
    const container = root.current?.parentElement;
    if (!container) return;
    const overscan = Math.min(1000, container.clientHeight);
    // Quantise so small scrolls keep the same band and the same render.
    const step = Math.max(200, overscan / 2);
    const next = {
      top: Math.floor((container.scrollTop - overscan) / step) * step,
      bottom: Math.ceil((container.scrollTop + container.clientHeight + overscan) / step) * step,
    };
    setRange((previous) => (sameBand(previous, next) ? previous : next));
  }, []);
  useLayoutEffect(() => {
    const container = root.current!.parentElement!;
    const update = () => {
      setAvailable(Math.max(260, container.clientWidth - 40));
      if (!pending.current) updateRange();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateRange]);
  useEffect(() => {
    let disposed = false;
    void pdf
      .getPage(initial.current.page)
      .then((page) => {
        if (disposed) return;
        const viewport = page.getViewport({ scale: 1 });
        const value = { width: viewport.width, height: viewport.height };
        readySize.current.set(initial.current.page, value);
        setSizes(new Map(readySize.current));
      })
      .catch((error) => {
        if (!disposed) callbacks.current.onError(String(error));
      });
    return () => {
      disposed = true;
    };
  }, [pdf]);
  const slots = useMemo(() => {
    const base = sizes.get(initial.current.page);
    if (!base || !fit) return [];
    return arrangeSlots(pdf.numPages, sizes, base, fit, zoom, layout);
  }, [sizes, fit, zoom, layout, pdf.numPages]);
  slotsRef.current = slots;
  const finishRestore = useCallback(() => {
    const container = root.current?.parentElement;
    const target = pending.current;
    if (!container || !target) return;
    const expected = slotsRef.current[target.page - 1];
    const frame = frames.current.get(target.page);
    const prepared = expected && frame && Math.abs(frame.viewport.width - expected.width) < 0.1;
    // A jump keeps the current viewport until its destination is ready to display.
    if (navigating.current && displayed.current && !prepared) return;
    const current = layoutModeRef.current;
    if (!current.continuous && !sameSpread(displayPageRef.current, target.page, current)) {
      if (prepared || !displayed.current) setDisplayPage(target.page);
      return;
    }
    restoreLocation(container, target);
    if (prepared) {
      anchor.current = target;
      activePage.current = target.page;
      pending.current = null;
      navigating.current = false;
      displayed.current = true;
      callbacks.current.onLocation(target);
    }
    updateRange();
  }, [updateRange]);
  useLayoutEffect(() => {
    if (!slots.length) return;
    if (revision.current !== jump.revision) {
      revision.current = jump.revision;
      navigating.current = true;
      pending.current = jump;
      anchor.current = jump;
      activePage.current = jump.page;
    } else if (!pending.current) pending.current = anchor.current;
    finishRestore();
  }, [slots, jump, displayPage, finishRestore]);
  const ready = useCallback(
    (page: number, frame: PageText) => {
      frames.current.set(page, frame);
      if (pending.current?.page === page) finishRestore();
    },
    [finishRestore],
  );
  useEffect(() => {
    const container = root.current!.parentElement!;
    let raf = 0;
    const scroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updateRange();
        if (pending.current) return;
        const top = container.scrollTop;
        const current = layoutModeRef.current.continuous
          ? slotsRef.current.find((item) => item.top + item.height > top + 24)
          : slotsRef.current[activePage.current - 1];
        if (!current) return;
        activePage.current = current.page;
        const location = captureLocation(container, current.page);
        if (location) {
          anchor.current = location;
          callbacks.current.onLocation(location);
        }
      });
    };
    const userScroll = () => {
      pending.current = null;
      navigating.current = false;
    };
    container.addEventListener('scroll', scroll, { passive: true });
    container.addEventListener('wheel', userScroll, { passive: true });
    container.addEventListener('touchmove', userScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('scroll', scroll);
      container.removeEventListener('wheel', userScroll);
      container.removeEventListener('touchmove', userScroll);
    };
  }, [updateRange]);
  const wanted = useMemo(() => {
    if (!slots.length) return [];
    const destination = revision.current !== jump.revision ? jump : pending.current;
    const focus = destination?.page || activePage.current;
    const band = range ?? {
      top: slots[jump.page - 1].top - 1000,
      bottom: slots[jump.page - 1].top + 2000,
    };
    const candidates = slots.filter((item) =>
      layout.continuous
        ? item.top + item.height >= band.top && item.top <= band.bottom
        : sameSpread(item.page, displayPage, layout),
    );
    const include = (page: number) => {
      const item = slots[page - 1];
      if (item && !candidates.includes(item)) candidates.push(item);
    };
    if (destination) {
      include(destination.page);
      if (layout.spread)
        include(destination.page % 2 ? destination.page + 1 : destination.page - 1);
    }
    if (dragPage && layout.continuous)
      for (
        let page = Math.min(dragPage, activePage.current);
        page <= Math.max(dragPage, activePage.current);
        page++
      )
        include(page);
    return candidates
      .sort((a, b) => Math.abs(a.page - focus) - Math.abs(b.page - focus))
      .map((item) => item.page);
  }, [slots, range, jump, layout, displayPage, dragPage]);
  const wantedKey = wanted.join(',');
  useEffect(() => {
    let disposed = false;
    // Request the destination text before neighbors so it can start rendering first.
    void (async () => {
      for (const number of wanted) {
        if (disposed) return;
        try {
          if (!readySize.current.has(number)) {
            const page = await pdf.getPage(number);
            if (disposed) return;
            const viewport = page.getViewport({ scale: 1 });
            readySize.current.set(number, { width: viewport.width, height: viewport.height });
            if (!pending.current) anchor.current = capture();
            setSizes(new Map(readySize.current));
          }
          const content = await getContent(number);
          if (disposed) return;
          setContents((previous) => {
            if (previous.get(number) === content) return previous;
            const next = new Map(previous);
            next.set(number, content);
            for (const key of next.keys()) if (!wanted.includes(key)) next.delete(key);
            return next;
          });
        } catch (error) {
          if (!disposed) callbacks.current.onError(String(error));
        }
      }
    })();
    for (const number of frames.current.keys())
      if (!wanted.includes(number)) frames.current.delete(number);
    return () => {
      disposed = true;
    };
  }, [wantedKey, pdf, getContent, capture]);
  const wantedSet = useMemo(() => new Set(wanted), [wantedKey]);
  const activeMarkPage = activeMarkId && marks.find((mark) => mark.id === activeMarkId)?.page;
  const marksByPage = useMemo(() => {
    const result = new Map<number, Annotation[]>();
    for (const mark of marks) {
      const page = result.get(mark.page);
      if (page) page.push(mark);
      else result.set(mark.page, [mark]);
    }
    return result;
  }, [marks]);
  return (
    <div
      className={`pdf-stage ${layout.continuous ? 'layout-continuous' : 'layout-paged'} ${layout.spread ? 'layout-spread' : ''}`}
      style={
        layout.spread
          ? { minWidth: Math.max(available + 40, (fit - PAGE_GAP) * zoom + 56) }
          : undefined
      }
      ref={root}
      onMouseUp={(event) => {
        if (!root.current) return;
        const selected = capturePDFSelection(root.current, frames.current);
        onSelection(selected);
        if (selected) return;
        const paper = (event.target as HTMLElement).closest<HTMLElement>('.pdf-paper');
        const frame = paper && frames.current.get(Number(paper.dataset.page));
        if (!paper || !frame || paper.getAttribute('aria-busy') === 'true') {
          onMarkClick(null);
          return;
        }
        const box = paper.getBoundingClientRect();
        const [x, y] = frame.viewport.convertToPdfPoint(
          event.clientX - box.left,
          event.clientY - box.top,
        );
        const mark = [...marks]
          .reverse()
          .find(
            (mark) =>
              mark.page === Number(paper.dataset.page) &&
              mark.rects.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]),
          );
        onMarkClick(
          mark
            ? {
                id: mark.id,
                x: Math.max(16, Math.min(window.innerWidth - 310, event.clientX - 130)),
                y: Math.max(56, event.clientY - 54),
              }
            : null,
        );
      }}
    >
      {!slots.length ? (
        <PageSkeleton label="正在打开当前页…" />
      ) : (
        slots.map((item) => (
          <PageSlot
            key={item.page}
            pdf={pdf}
            page={item.page}
            width={item.width}
            height={item.height}
            hidden={!layout.continuous && !sameSpread(item.page, displayPage, layout)}
            content={wantedSet.has(item.page) ? contents.get(item.page) : undefined}
            marks={marksByPage.get(item.page) || NO_MARKS}
            activeMarkId={activeMarkPage === item.page ? activeMarkId : null}
            dark={dark}
            query={query}
            activeOffset={activeMatch?.page === item.page ? activeMatch.offset : undefined}
            onDestination={openDestination}
            onReady={ready}
            onError={onError}
          />
        ))
      )}
    </div>
  );
});

const PageSlot = memo(function PageSlot({
  pdf,
  page,
  width,
  height,
  hidden,
  content,
  marks,
  activeMarkId,
  dark,
  query,
  activeOffset,
  onDestination,
  onReady,
  onError,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  height: number;
  hidden: boolean;
  content: PageContent | undefined;
  marks: Annotation[];
  activeMarkId: string | null;
  dark: boolean;
  query: string;
  activeOffset: number | undefined;
  onDestination: (dest: Destination) => void;
  onReady: (page: number, frame: PageText) => void;
  onError: (message: string) => void;
}) {
  return (
    <div
      className={`pdf-slot ${dark ? 'dark-paper' : ''}`}
      data-page={page}
      style={{
        width,
        height,
        ...(hidden
          ? ({ position: 'absolute', left: -100000, top: 0, visibility: 'hidden' } as const)
          : {}),
      }}
      aria-label={`第 ${page} 页`}
    >
      {content ? (
        <PDFPage
          pdf={pdf}
          page={page}
          content={content}
          width={width}
          marks={marks}
          activeMarkId={activeMarkId}
          dark={dark}
          query={query}
          activeOffset={activeOffset}
          onDestination={onDestination}
          onReady={onReady}
          onError={onError}
        />
      ) : (
        <span className="page-placeholder">{page}</span>
      )}
    </div>
  );
});

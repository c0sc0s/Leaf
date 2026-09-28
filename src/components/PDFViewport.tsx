import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, PageContent, ReadingLocation, ReadingLayout } from '../types';
import { captureLocation, restoreLocation } from '../lib/position';
import { capturePDFSelection, type DocumentSelection, type PageText } from '../lib/selection';
import { PDFPage } from './PDFPage';
import { Spinner } from './UI';
export interface PDFViewportHandle {
  capture: () => ReadingLocation;
}
interface Props {
  pdf: PDFDocumentProxy;
  getContent: (page: number) => Promise<PageContent>;
  marks: Annotation[];
  zoom: number;
  mode: ReadingLayout;
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
interface Size {
  width: number;
  height: number;
}
export const PDFViewport = forwardRef<PDFViewportHandle, Props>(function PDFViewport(
  {
    pdf,
    getContent,
    marks,
    zoom,
    mode,
    dark,
    query,
    jump,
    activeMatch,
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
  const destination = useCallback(
    async (dest: string | unknown[]) => {
      const target = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
      if (!Array.isArray(target)) return;
      const n =
        typeof target[0] === 'object'
          ? (await pdf.getPageIndex(target[0] as { num: number; gen: number })) + 1
          : Number(target[0]) + 1;
      const type = (target[1] as { name: string })?.name;
      const y =
        type === 'XYZ'
          ? target[3]
          : type === 'FitH' || type === 'FitBH'
            ? target[2]
            : type === 'FitR'
              ? target[5]
              : null;
      const viewport = (await pdf.getPage(n)).getViewport({ scale: 1 });
      onNavigate(n, {
        page: n,
        ratio:
          typeof y === 'number'
            ? Math.max(0, viewport.convertToViewportPoint(0, y)[1] / viewport.height)
            : 0,
      });
    },
    [pdf, onNavigate],
  );
  const [width, setWidth] = useState(0);
  const [displayPage, setDisplayPage] = useState(jump.page);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const displayPageRef = useRef(displayPage);
  displayPageRef.current = displayPage;
  const [sizes, setSizes] = useState<Map<number, Size>>(new Map());
  const [contents, setContents] = useState<Map<number, PageContent>>(new Map());
  const [view, setView] = useState({ top: -1, height: 800 });
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
  const layoutRef = useRef<{ page: number; top: number; height: number; width: number }[]>([]);
  const readySize = useRef(new Map<number, Size>());
  const capture = useCallback(
    () =>
      pending.current ||
      (root.current?.parentElement &&
        captureLocation(root.current.parentElement, activePage.current)) ||
      anchor.current,
    [],
  );
  useImperativeHandle(ref, () => ({ capture }), [capture]);
  useLayoutEffect(() => {
    const container = root.current!.parentElement!;
    const update = () => {
      setWidth(Math.max(260, container.clientWidth - 40));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
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
  const layout = useMemo(() => {
    const base = sizes.get(initial.current.page);
    if (!base || !width) return [];
    let top = 16;
    return Array.from({ length: pdf.numPages }, (_, i) => {
      const size = sizes.get(i + 1) || base;
      const pageWidth = (mode === 'spread' ? (width - 16) / 2 : width) * zoom;
      const height = (size.height / size.width) * pageWidth;
      const entry = {
        page: i + 1,
        top: mode === 'continuous' ? top : 16,
        width: pageWidth,
        height,
      };
      top += height + 16;
      return entry;
    });
  }, [sizes, width, zoom, mode, pdf.numPages]);
  layoutRef.current = layout;
  const finishRestore = useCallback(() => {
    const container = root.current?.parentElement;
    const target = pending.current;
    if (!container || !target) return;
    const expected = layoutRef.current[target.page - 1];
    const frame = frames.current.get(target.page);
    const prepared = expected && frame && Math.abs(frame.viewport.width - expected.width) < 0.1;
    // A jump keeps the current viewport until its destination is ready to display.
    if (navigating.current && displayed.current && !prepared) return;
    if (
      modeRef.current !== 'continuous' &&
      !sameGroup(displayPageRef.current, target.page, modeRef.current)
    ) {
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
    setView({ top: container.scrollTop, height: container.clientHeight });
  }, []);
  useLayoutEffect(() => {
    if (!layout.length) return;
    if (revision.current !== jump.revision) {
      revision.current = jump.revision;
      navigating.current = true;
      pending.current = jump;
      anchor.current = jump;
      activePage.current = jump.page;
    } else if (!pending.current) pending.current = anchor.current;
    finishRestore();
  }, [layout, jump, displayPage, finishRestore]);
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
        const top = container.scrollTop;
        setView({ top, height: container.clientHeight });
        if (pending.current) return;
        const current =
          modeRef.current === 'continuous'
            ? layoutRef.current.find((item) => item.top + item.height > top + 24)
            : layoutRef.current[activePage.current - 1];
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
  }, []);
  const wanted = useMemo(() => {
    if (!layout.length) return [];
    const top = view.top < 0 ? layout[jump.page - 1].top : view.top;
    const overscan = Math.min(1000, view.height);
    const candidates = layout.filter((item) =>
      mode === 'continuous'
        ? item.top + item.height >= top - overscan && item.top <= top + view.height + overscan
        : sameGroup(item.page, displayPage, mode),
    );
    const destination = revision.current !== jump.revision ? jump : pending.current;
    if (destination && !candidates.some((item) => item.page === destination.page))
      candidates.push(layout[destination.page - 1]);
    if (mode === 'spread' && destination) {
      const mate = destination.page % 2 ? destination.page + 1 : destination.page - 1;
      if (layout[mate - 1] && !candidates.some((item) => item.page === mate))
        candidates.push(layout[mate - 1]);
    }
    if (dragPage && mode === 'continuous') {
      for (const item of layout)
        if (
          item.page >= Math.min(dragPage, activePage.current) &&
          item.page <= Math.max(dragPage, activePage.current) &&
          !candidates.includes(item)
        )
          candidates.push(item);
    }
    return candidates
      .sort(
        (a, b) =>
          Math.abs(a.page - (destination?.page || activePage.current)) -
          Math.abs(b.page - (destination?.page || activePage.current)),
      )
      .map((item) => item.page);
  }, [layout, view, jump, mode, displayPage, dragPage]);
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
  const wantedSet = new Set(wanted);
  return (
    <div
      className={`pdf-stage layout-${mode}`}
      style={
        mode === 'spread' ? { minWidth: Math.max(width + 40, (width - 16) * zoom + 56) } : undefined
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
      {!layout.length ? (
        <Spinner text="正在打开当前页…" />
      ) : (
        layout.map((item) => (
          <div
            key={item.page}
            className={`pdf-slot ${dark ? 'dark-paper' : ''}`}
            data-page={item.page}
            style={{
              width: item.width,
              height: item.height,
              ...(mode !== 'continuous' && !sameGroup(item.page, displayPage, mode)
                ? ({ position: 'absolute', left: -100000, top: 0, visibility: 'hidden' } as const)
                : {}),
            }}
            aria-label={`第 ${item.page} 页`}
          >
            {wantedSet.has(item.page) && contents.has(item.page) ? (
              <PDFPage
                pdf={pdf}
                page={item.page}
                content={contents.get(item.page)!}
                width={item.width}
                marks={marks.filter((mark) => mark.page === item.page)}
                dark={dark}
                query={query}
                activeOffset={activeMatch?.page === item.page ? activeMatch.offset : undefined}
                onDestination={(dest) =>
                  void destination(dest).catch((error) => onError(String(error)))
                }
                onReady={ready}
                onError={onError}
              />
            ) : (
              <span className="page-placeholder">{item.page}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
});

function sameGroup(a: number, b: number, mode: ReadingLayout) {
  return mode === 'spread' ? Math.floor((a - 1) / 2) === Math.floor((b - 1) / 2) : a === b;
}

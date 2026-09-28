import { EmptyState } from '@/components/Mascot';
import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Highlighter } from '@/components/icons';
import { AnimatePresence, m } from 'motion/react';
import type {
  Annotation,
  Book,
  MarkColor,
  MarkKind,
  ReadingLayout,
  ReadingLocation,
  ReadingState,
  Settings,
} from '../../types';
import { storage } from '../../lib/db';
import { colors, exportAnnotated, notesMarkdown, saveFile } from '../../lib/export';
import type { DocumentSelection } from '../../lib/selection';
import { initialReadingState, saveReadingState } from '../../lib/position';
import { pageStep } from '../../lib/layout';
import { ReadingScheduler } from '../../lib/scheduler';
import { useAnnotations } from '../../lib/useAnnotations';
import { rise } from '../../lib/motion';
import { Exiting, Spinner } from '../../components/UI';
import { SelectionTools, MarkTools } from './AnnotationTools';
import { NotesPanel } from './NotesPanel';
import { ReaderHeader } from './ReaderHeader';
import { ReaderStatus } from './ReaderStatus';
import { ReaderSidebar, type SidebarTab } from './sidebar/ReaderSidebar';
import { ThumbnailList } from './sidebar/Thumbnails';
import { OutlineTree } from './sidebar/OutlineTree';
import { BookmarkList } from './sidebar/BookmarkList';
import { SearchPanel } from './sidebar/SearchPanel';
import { PDFViewport, type PDFViewportHandle } from './viewport/PDFViewport';
import { usePdfDocument } from './hooks/usePdfDocument';
import { useDocumentSearch, type SearchResult } from './hooks/useDocumentSearch';
import { useReaderShortcuts } from './hooks/useReaderShortcuts';
import { createLocationStore } from './hooks/locationStore';
import { clampZoom, stepZoom } from './zoom';

// Writing the book record rewrites its PDF blob, so progress is saved once reading settles.
const PROGRESS_SAVE_DELAY = 1000;

interface Props {
  book: Book;
  settings: Settings;
  dark: boolean;
  onClose: () => void;
  onUpdate: (book: Book) => void;
  onSettings: () => void;
  notify: (message: string) => void;
  askPassword: () => Promise<string | null>;
}
export function Reader({
  book,
  settings,
  dark,
  onClose,
  onUpdate,
  onSettings,
  notify,
  askPassword,
}: Props) {
  const saved = useMemo(() => initialReadingState(book), [book.id]);
  const [scheduler] = useState(() => new ReadingScheduler());
  const [locationStore] = useState(() => createLocationStore(saved));
  const viewer = useRef<PDFViewportHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const annotations = useAnnotations(notify);
  const { marks } = annotations;
  const { pdf, error, outline, outlineReady, pageLabels, getContent } = usePdfDocument(
    book,
    askPassword,
  );
  const search = useDocumentSearch(pdf, getContent, scheduler, notify);

  const [history, setHistory] = useState<ReadingState[]>([]);
  const [page, setPage] = useState(saved.page);
  const [jump, setJump] = useState({ ...saved, revision: 0 });
  const [zoom, setZoom] = useState(saved.zoom);
  const [layout, setLayout] = useState<ReadingLayout>(saved.layout);
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<SidebarTab>('pages');
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [activeMark, setActiveMark] = useState<{ id: string; x: number; y: number } | null>(null);
  const [continuousHighlight, setContinuousHighlight] = useState(false);
  const [deleted, setDeleted] = useState<Annotation | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>(book.bookmarks || []);
  const [color, setColor] = useState<MarkColor>(() => {
    const value = localStorage.getItem('folio-mark-color');
    return value && value in colors ? (value as MarkColor) : 'amber';
  });

  const bookRef = useRef(book);
  bookRef.current = book;
  const pageRef = useRef(page);
  pageRef.current = page;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const locationRef = useRef<ReadingLocation>(saved);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persistenceError = useRef(false);

  useEffect(() => {
    localStorage.setItem('folio-mark-color', color);
  }, [color]);
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => setDeleted(null), 6000);
    return () => clearTimeout(timer);
  }, [deleted]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement)?.closest('.annotation-popover')) setActiveMark(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);
  useEffect(() => {
    let disposed = false;
    void storage.annotations(book.id).then((value) => {
      if (!disposed) annotations.load(value);
    });
    return () => {
      disposed = true;
    };
  }, [book.id, annotations.load]);

  const persist = useCallback(() => {
    try {
      saveReadingState(book.id, {
        ...locationRef.current,
        zoom: zoomRef.current,
        layout: layoutRef.current,
      });
    } catch {
      if (!persistenceError.current) {
        persistenceError.current = true;
        notify('阅读位置未能保存，请检查本机存储空间。');
      }
    }
  }, [book.id, notify]);
  const saveProgress = useCallback(
    () => onUpdate({ ...bookRef.current, page: pageRef.current, openedAt: Date.now() }),
    [onUpdate],
  );
  useEffect(() => {
    if (!pdf) return;
    const timer = setTimeout(saveProgress, PROGRESS_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [pdf, page, saveProgress]);
  const opened = !!pdf;
  useEffect(() => {
    if (!opened) return;
    window.addEventListener('pagehide', saveProgress);
    return () => {
      window.removeEventListener('pagehide', saveProgress);
      saveProgress();
    };
  }, [opened, saveProgress]);
  useEffect(() => {
    const busy = scheduler.busy;
    window.addEventListener('wheel', busy, { passive: true });
    window.addEventListener('pointerdown', busy, { passive: true });
    window.addEventListener('keydown', busy);
    window.addEventListener('pagehide', persist);
    return () => {
      clearTimeout(saveTimer.current);
      persist();
      window.removeEventListener('wheel', busy);
      window.removeEventListener('pointerdown', busy);
      window.removeEventListener('keydown', busy);
      window.removeEventListener('pagehide', persist);
    };
  }, [scheduler, persist]);

  const captureCurrent = useCallback((): ReadingState => {
    const location = viewer.current?.capture();
    if (location) locationRef.current = location;
    return { ...locationRef.current, zoom: zoomRef.current, layout: layoutRef.current };
  }, []);
  const handleLocation = useCallback(
    (location: ReadingLocation) => {
      locationRef.current = location;
      locationStore.set(location);
      if (pageRef.current !== location.page) {
        pageRef.current = location.page;
        setPage(location.page);
      }
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 180);
    },
    [persist, locationStore],
  );
  const navigate = useCallback(
    (n: number, location?: ReadingLocation, remember = true) => {
      const previous = captureCurrent();
      if (remember) setHistory((items) => [...items.slice(-49), previous]);
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
      setHistory((items) => [...items.slice(-49), current]);
      setLayout(next);
      setJump((j) => ({ ...current, layout: next, revision: j.revision + 1 }));
    },
    [captureCurrent],
  );
  const zoomIn = useCallback(() => setZoom((z) => stepZoom(z, 1)), []);
  const zoomOut = useCallback(() => setZoom((z) => stepZoom(z, -1)), []);
  const resetZoom = useCallback(() => setZoom(1), []);
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    // Trackpad pinch arrives as a ctrl+wheel event.
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-event.deltaY * 0.01)));
    };
    container.addEventListener('wheel', pinch, { passive: false });
    return () => container.removeEventListener('wheel', pinch);
  }, []);

  const openSearch = useCallback(() => {
    setFocus(false);
    setLeft(true);
    setTab('search');
    searchInput.current?.focus();
  }, []);
  useEffect(() => {
    if (left && tab === 'search' && !focus) searchInput.current?.focus();
  }, [left, tab, focus]);
  useReaderShortcuts({
    search: openSearch,
    undo: () => void annotations.undo(),
    redo: () => void annotations.redo(),
    zoomIn,
    zoomOut,
    resetZoom,
    page: (direction) => navigate(pageRef.current + direction * pageStep(layoutRef.current)),
    screen: (direction) => {
      const container = scroller.current;
      if (!container) return;
      const boundary =
        direction > 0
          ? container.scrollTop + container.clientHeight >= container.scrollHeight - 2
          : container.scrollTop <= 2;
      if (boundary) navigate(pageRef.current + direction * pageStep(layoutRef.current));
      else container.scrollBy({ top: direction * container.clientHeight * 0.9 });
    },
    escape: () => {
      setSelection(null);
      setActiveMark(null);
      setContinuousHighlight(false);
      setFocus(false);
    },
    toggleFocus: () => setFocus((value) => !value),
  });

  async function annotate(kind: MarkKind, writeNote = false, target = selection) {
    if (!target) return;
    const added: Annotation[] = target.anchors.map((anchor) => ({
      id: crypto.randomUUID(),
      bookId: book.id,
      page: anchor.page,
      start: anchor.start,
      end: anchor.end,
      quote: anchor.quote,
      rects: anchor.rects,
      kind,
      color,
      note: '',
      createdAt: Date.now(),
      source: 'text',
    }));
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    await annotations.add(added);
    if (writeNote) focusNote(added[0].id);
  }
  const focusNote = (id: string) => {
    setActiveMark(null);
    setRight(true);
    setFocus(false);
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>(`[data-note-id="${id}"]`)?.focus(),
    );
  };
  const removeMark = useCallback(
    async (mark: Annotation) => {
      await annotations.remove(mark);
      setActiveMark(null);
      setDeleted(mark);
    },
    [annotations.remove],
  );
  const exportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const data = await exportAnnotated(book.blob, await annotations.flush());
      if (await saveFile(book.filename.replace(/\.pdf$/i, '') + '-批注.pdf', data))
        notify('批注 PDF 已导出');
    } catch (e) {
      notify('无法导出：加密 PDF 需先解除文件保护。' + String(e));
    } finally {
      setExporting(false);
    }
  }, [book.blob, book.filename, annotations.flush, notify]);
  const exportNotes = useCallback(async () => {
    try {
      if (
        await saveFile(
          book.title + '-笔记.md',
          new TextEncoder().encode(notesMarkdown(book.title, await annotations.flush())),
          'text/markdown',
        )
      )
        notify('阅读笔记已导出');
    } catch {
      notify('无法导出笔记');
    }
  }, [book.title, annotations.flush, notify]);
  const bookmarked = bookmarks.includes(page);
  const toggleBookmark = useCallback(() => {
    const next = bookmarked
      ? bookmarks.filter((n) => n !== page)
      : [...bookmarks, page].sort((a, b) => a - b);
    setBookmarks(next);
    const bookmarkLocations = { ...bookRef.current.bookmarkLocations };
    if (next.includes(page)) bookmarkLocations[page] = captureCurrent();
    else delete bookmarkLocations[page];
    onUpdate({ ...bookRef.current, bookmarks: next, bookmarkLocations });
  }, [bookmarked, bookmarks, page, captureCurrent, onUpdate]);
  const openBookmark = useCallback(
    (n: number) => navigate(n, bookRef.current.bookmarkLocations?.[n]),
    [navigate],
  );
  const openSearchResult = useCallback(
    (r: SearchResult) => {
      search.setActiveMatch({ page: r.page, offset: r.offset });
      navigate(r.page, { page: r.page, ratio: 0, offset: r.offset, screenY: 32 });
    },
    [navigate, search.setActiveMatch],
  );
  const navigationOpen = left && tab !== 'search';
  const searchOpen = left && tab === 'search';
  const toggleNavigation = useCallback(() => {
    setLeft(!navigationOpen);
    if (tab === 'search') setTab('pages');
  }, [navigationOpen, tab]);
  const toggleSearch = useCallback(() => {
    setLeft(!searchOpen);
    setTab('search');
  }, [searchOpen]);
  const toggleNotes = useCallback(() => setRight((value) => !value), []);
  // A highlight opens its note beside the text; a plain click on the page puts the notes away.
  const clickMark = useCallback((mark: { id: string; x: number; y: number } | null) => {
    setActiveMark(mark);
    setRight(Boolean(mark));
  }, []);
  const closeNotes = useCallback(() => setRight(false), []);
  const toggleFocus = useCallback(() => setFocus((value) => !value), []);
  const styleMark = useCallback(
    (id: string, changes: { kind?: MarkKind; color?: MarkColor }) =>
      void annotations.style(id, changes),
    [annotations.style],
  );
  const readerDark = settings.readerTheme === 'dark' || (settings.readerTheme === 'follow' && dark);
  const selectedMark = activeMark && marks.find((mark) => mark.id === activeMark.id);

  return (
    <div className={`reader ${focus ? 'reader-focus' : ''}`}>
      <ReaderHeader
        title={book.title}
        author={book.author}
        navigationOpen={navigationOpen}
        searchOpen={searchOpen}
        notesOpen={right}
        focus={focus}
        bookmarked={bookmarked}
        canReturn={!!history.length}
        zoom={zoom}
        exporting={exporting}
        continuousHighlight={continuousHighlight}
        onBack={onClose}
        onToggleNavigation={toggleNavigation}
        onToggleSearch={toggleSearch}
        onReturn={returnToPrevious}
        onToggleBookmark={toggleBookmark}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onToggleNotes={toggleNotes}
        onToggleFocus={toggleFocus}
        onExportPDF={() => void exportPDF()}
        onExportNotes={() => void exportNotes()}
        onContinuousHighlight={setContinuousHighlight}
        onSettings={onSettings}
      />
      <div className="reader-body">
        <AnimatePresence initial={false}>
          {left && !focus && (
            <Exiting key="sidebar">
              <ReaderSidebar tab={tab} onTab={setTab}>
                {tab === 'search' ? (
                  <SearchPanel
                    input={searchInput}
                    query={search.query}
                    results={search.results}
                    progress={search.progress}
                    activeMatch={search.activeMatch}
                    completedQuery={search.completedQuery}
                    onQuery={search.setQuery}
                    onSelect={openSearchResult}
                  />
                ) : tab === 'outline' ? (
                  outline.length ? (
                    <OutlineTree items={outline} location={locationStore} onNavigate={navigate} />
                  ) : (
                    <div className="sidebar-scroll">
                      {outlineReady ? (
                        <EmptyState
                          scene="outline"
                          compact
                          action={{ label: '查看缩略图', onClick: () => setTab('pages') }}
                        />
                      ) : (
                        <Spinner text="正在读取目录…" />
                      )}
                    </div>
                  )
                ) : tab === 'bookmarks' ? (
                  <BookmarkList bookmarks={bookmarks} onSelect={openBookmark} />
                ) : (
                  pdf && (
                    <ThumbnailList
                      pdf={pdf}
                      page={page}
                      revealKey={jump.revision}
                      onSelect={navigateToPage}
                    />
                  )
                )}
              </ReaderSidebar>
            </Exiting>
          )}
        </AnimatePresence>
        <main
          ref={scroller}
          className={`reading-canvas ${readerDark ? 'reader-dark' : 'reader-light'}`}
          onScroll={() => {
            scheduler.busy();
            setSelection(null);
            setActiveMark(null);
          }}
        >
          {error ? (
            <div className="empty-state">
              <FileText size={36} />
              <h3>无法读取这个文件</h3>
              <p>{error}</p>
              <Button variant="default" onClick={onClose}>
                返回书架
              </Button>
            </div>
          ) : !pdf ? (
            <Spinner text="正在打开 PDF…" />
          ) : (
            <PDFViewport
              ref={viewer}
              pdf={pdf}
              getContent={getContent}
              marks={marks}
              activeMarkId={activeMark?.id ?? null}
              zoom={zoom}
              layout={layout}
              dark={readerDark && !settings.originalColors}
              query={search.query}
              activeMatch={search.activeMatch}
              onMarkClick={clickMark}
              onNavigate={navigate}
              jump={jump}
              onLocation={handleLocation}
              onSelection={(value) => {
                setSelection(value);
                setActiveMark(null);
                if (value && continuousHighlight) void annotate('highlight', false, value);
              }}
              onError={notify}
            />
          )}
        </main>
        <AnimatePresence>
          {right && !focus && (
            <Exiting key="notes">
              <NotesPanel
                marks={marks}
                page={page}
                activeId={activeMark?.id ?? null}
                onNote={annotations.note}
                onStyle={styleMark}
                onRemove={(mark) => void removeMark(mark)}
                onNavigate={navigate}
                onClose={closeNotes}
              />
            </Exiting>
          )}
        </AnimatePresence>
      </div>
      <ReaderStatus
        page={page}
        pages={pdf?.numPages || book.pages}
        pageLabel={pageLabels?.[page - 1]}
        layout={layout}
        saveStatus={annotations.status}
        onLayout={changeLayout}
        onNavigate={navigateToPage}
      />
      <AnimatePresence>
        {continuousHighlight && (
          <Exiting key="active-tool">
            <m.div className="active-tool" {...rise}>
              <Highlighter size={14} style={{ color: colors[color] }} />
              连续高亮
              <Button variant="ghost" onClick={() => setContinuousHighlight(false)}>
                退出 · Esc
              </Button>
            </m.div>
          </Exiting>
        )}
        {deleted && (
          <Exiting key="undo">
            <m.div className="undo-notice" role="status" {...rise}>
              已删除批注
              <Button
                variant="ghost"
                onClick={() => {
                  void annotations.add([deleted]);
                  setDeleted(null);
                }}
              >
                撤销
              </Button>
            </m.div>
          </Exiting>
        )}
        {selection && (
          <Exiting key="selection">
            <SelectionTools
              selection={selection}
              color={color}
              onColor={setColor}
              onAnnotate={(kind, note) => void annotate(kind, note)}
              onClose={() => setSelection(null)}
              onCopy={() => {
                void navigator.clipboard
                  .writeText(selection.quote)
                  .then(() => notify('文字已复制'))
                  .catch(() => notify('无法访问剪贴板'));
              }}
            />
          </Exiting>
        )}
        {activeMark && selectedMark && (
          <Exiting key={`mark:${activeMark.id}`}>
            <MarkTools
              mark={selectedMark}
              position={activeMark}
              onColor={(next) => void annotations.style(activeMark.id, { color: next })}
              onNote={() => focusNote(activeMark.id)}
              onClose={() => setActiveMark(null)}
              onDelete={() => void removeMark(selectedMark)}
            />
          </Exiting>
        )}
      </AnimatePresence>
    </div>
  );
}

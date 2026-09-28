import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  PanelLeft,
  NotebookPen,
  Search,
  X,
  Highlighter,
  Underline,
  Trash2,
  Download,
  Bookmark,
  Minus,
  Plus,
  SlidersHorizontal,
  ArrowUpRight,
  Sun,
  Moon,
  Maximize,
  Minimize,
  Undo2,
  Redo2,
  History,
  MoreHorizontal,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  Annotation,
  Book,
  MarkColor,
  MarkKind,
  PageContent,
  Settings,
  ReadingLocation,
  ReadingState,
  ReadingLayout,
} from '../types';
import { loadPDF, extractPage } from '../lib/pdf';
import { storage } from '../lib/db';
import { colors, exportAnnotated, notesMarkdown, saveFile } from '../lib/export';
import type { DocumentSelection } from '../lib/selection';
import { initialReadingState, saveReadingState } from '../lib/position';
import { ReadingScheduler } from '../lib/scheduler';
import { useAnnotations } from '../lib/useAnnotations';
import { NoteEditor } from './NoteEditor';
import { PDFViewport, type PDFViewportHandle } from './PDFViewport';
import { IconButton, Spinner } from './UI';
import { SelectionTools, MarkTools } from './AnnotationTools';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
interface Props {
  book: Book;
  settings: Settings;
  dark: boolean;
  onClose: () => void;
  onUpdate: (book: Book) => void;
  onSettings: () => void;
  onToggleTheme: () => void;
  notify: (message: string) => void;
  askPassword: () => Promise<string | null>;
}
interface SearchResult {
  page: number;
  excerpt: string;
  count: number;
  offset: number;
}
export function Reader({
  book,
  settings,
  dark,
  onClose,
  onUpdate,
  onSettings,
  onToggleTheme,
  notify,
  askPassword,
}: Props) {
  const saved = useMemo(() => initialReadingState(book), [book.id]);
  const scheduler = useRef(new ReadingScheduler()).current;
  const viewer = useRef<PDFViewportHandle>(null);
  const annotations = useAnnotations(notify);
  const { marks } = annotations;
  const [history, setHistory] = useState<ReadingState[]>([]);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(saved.page);
  const [pageInput, setPageInput] = useState(String(saved.page));
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [jump, setJump] = useState({ ...saved, revision: 0 });
  const [color, setColor] = useState<MarkColor>(() => {
    const saved = localStorage.getItem('folio-mark-color');
    return saved && saved in colors ? (saved as MarkColor) : 'amber';
  });
  useEffect(() => {
    localStorage.setItem('folio-mark-color', color);
  }, [color]);
  const [activeMark, setActiveMark] = useState<{ id: string; x: number; y: number } | null>(null);
  const [continuousHighlight, setContinuousHighlight] = useState(false);
  const [deleted, setDeleted] = useState<Annotation | null>(null);
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [pageLabels, setPageLabels] = useState<string[] | null>(null);
  const [activeMatch, setActiveMatch] = useState<{ page: number; offset: number } | null>(null);
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
  const [left, setLeft] = useState(false);
  const [focus, setFocus] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [right, setRight] = useState(false);
  const [tab, setTab] = useState<'pages' | 'outline' | 'bookmarks' | 'search'>('pages');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchProgress, setSearchProgress] = useState<number | null>(null);
  const [outline, setOutline] = useState<
    { title: string; page: number; depth: number; location?: ReadingLocation }[]
  >([]);
  const [zoom, setZoom] = useState(saved.zoom);
  const [layout, setLayout] = useState<ReadingLayout>(saved.layout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>(book.bookmarks || []);
  const cache = useRef(new Map<number, Promise<PageContent>>());
  const scroller = useRef<HTMLDivElement>(null);
  const bookRef = useRef(book);
  bookRef.current = book;
  const searchEpoch = useRef(0);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const locationRef = useRef<ReadingLocation>(saved);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persistenceError = useRef(false);
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
  const captureCurrent = useCallback((): ReadingState => {
    const location = viewer.current?.capture();
    if (location) locationRef.current = location;
    return { ...locationRef.current, zoom: zoomRef.current, layout: layoutRef.current };
  }, []);
  const handleLocation = useCallback(
    (location: ReadingLocation) => {
      locationRef.current = location;
      if (pageRef.current !== location.page) {
        pageRef.current = location.page;
        setPage(location.page);
      }
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 180);
    },
    [persist],
  );
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
  useEffect(() => {
    let current: PDFDocumentProxy | undefined;
    let disposed = false;
    const loading = book.blob
      .arrayBuffer()
      .then((data) => {
        if (disposed) return;
        const task = loadPDF(data, (update) => {
          void askPassword().then((password) => {
            if (password !== null && !disposed) update(password);
            else void task.destroy();
          });
        });
        currentTask = task;
        return task.promise;
      })
      .then(async (p) => {
        if (!p) return;
        current = p;
        if (disposed) {
          await p.loadingTask.destroy();
          return;
        }
        setPdf(p);
        void p
          .getPageLabels()
          .then((labels) => {
            if (!disposed) setPageLabels(labels);
          })
          .catch(() => {});
        const native = await p.getOutline().catch(() => null);
        if (native) {
          const items: {
            title: string;
            page: number;
            depth: number;
            location?: ReadingLocation;
          }[] = [];
          async function walk(entries: typeof native, depth: number) {
            for (const entry of entries!) {
              let dest = entry.dest;
              if (typeof dest === 'string') dest = await p!.getDestination(dest);
              let n = 1;
              if (Array.isArray(dest)) {
                const ref = dest[0];
                n = typeof ref === 'object' ? (await p!.getPageIndex(ref)) + 1 : Number(ref) + 1;
              }
              let location: ReadingLocation | undefined;
              if (Array.isArray(dest)) {
                const kind = dest[1]?.name;
                const top =
                  kind === 'XYZ'
                    ? dest[3]
                    : kind === 'FitH' || kind === 'FitBH'
                      ? dest[2]
                      : kind === 'FitR'
                        ? dest[5]
                        : null;
                if (typeof top === 'number') {
                  const targetPage = await p!.getPage(n);
                  const viewport = targetPage.getViewport({ scale: 1 });
                  location = {
                    page: n,
                    ratio: Math.max(
                      0,
                      viewport.convertToViewportPoint(0, top)[1] / viewport.height,
                    ),
                    screenY: 24,
                  };
                }
              }
              items.push({ title: entry.title, page: n, depth, location });
              if (entry.items.length) await walk(entry.items, depth + 1);
            }
          }
          await walk(native, 0);
          if (!disposed) setOutline(items);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e instanceof Error ? e.message : '无法打开 PDF');
      });
    let currentTask: ReturnType<typeof loadPDF> | undefined;
    void loading;
    void storage.annotations(book.id).then((a) => {
      if (!disposed) annotations.load(a);
    });
    return () => {
      disposed = true;
      searchEpoch.current++;
      cache.current.clear();
      void (current?.loadingTask.destroy() || currentTask?.destroy());
    };
  }, [book.id, book.blob, askPassword]);
  const getContent = useCallback(
    (n: number) => {
      if (!pdf) return Promise.reject(new Error('PDF 尚未加载'));
      let value = cache.current.get(n);
      if (!value) {
        value = extractPage(pdf, n);
        cache.current.set(n, value);
        if (cache.current.size > 30) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined && oldest !== n) cache.current.delete(oldest);
        }
        value.catch(() => cache.current.delete(n));
      }
      return value;
    },
    [pdf, book.id],
  );
  useEffect(() => {
    if (pdf) onUpdate({ ...bookRef.current, page, openedAt: Date.now() });
  }, [pdf, page, onUpdate]);
  useEffect(() => setPageInput(String(page)), [page]);
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
  const returnToPrevious = () => {
    const target = history.at(-1);
    if (!target) return;
    setHistory((items) => items.slice(0, -1));
    setZoom(target.zoom);
    setLayout(target.layout);
    navigate(target.page, target, false);
  };
  const historyActions = useRef(annotations);
  historyActions.current = annotations;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('[role=dialog],[role=menu]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setFocus(false);
        setLeft(true);
        setTab('search');
        searchInput.current?.focus();
        return;
      }
      if (target?.closest('input,textarea,select,[contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void (e.shiftKey ? historyActions.current.redo() : historyActions.current.undo());
        return;
      }
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        const container = scroller.current;
        if (!container) return;
        const direction = e.key === 'PageDown' ? 1 : -1;
        const boundary =
          direction > 0
            ? container.scrollTop + container.clientHeight >= container.scrollHeight - 2
            : container.scrollTop <= 2;
        if (boundary)
          navigate(pageRef.current + direction * (layoutRef.current === 'spread' ? 2 : 1));
        else container.scrollBy({ top: direction * container.clientHeight * 0.9 });
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(pageRef.current + (layoutRef.current === 'spread' ? 2 : 1));
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(pageRef.current - (layoutRef.current === 'spread' ? 2 : 1));
      }
      if (e.key === 'Escape') {
        setSelection(null);
        setActiveMark(null);
        setContinuousHighlight(false);
        setFocus(false);
      }
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setFocus((value) => !value);
      }
    };
    window.document.addEventListener('keydown', listener);
    return () => window.document.removeEventListener('keydown', listener);
  }, [navigate]);
  useEffect(() => {
    if (left && tab === 'search' && !focus) searchInput.current?.focus();
  }, [left, tab, focus]);
  useEffect(() => {
    const epoch = ++searchEpoch.current;
    setResults([]);
    setActiveMatch(null);
    if (!query.trim() || !pdf) {
      setSearchProgress(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchProgress(0);
      const found: SearchResult[] = [];
      try {
        for (let n = 1; n <= pdf.numPages; n++) {
          if (epoch !== searchEpoch.current) return;
          await scheduler.checkpoint();
          if (epoch !== searchEpoch.current) return;
          const c = await getContent(n);
          if (epoch !== searchEpoch.current) return;
          const needle = query.toLowerCase();
          let pos = c.text.toLowerCase().indexOf(needle);
          while (pos >= 0) {
            found.push({
              page: n,
              count: 1,
              offset: pos,
              excerpt:
                (pos > 35 ? '…' : '') +
                c.text.slice(Math.max(0, pos - 35), pos + query.length + 80) +
                '…',
            });
            pos = c.text.toLowerCase().indexOf(needle, pos + needle.length);
          }
          setResults([...found]);
          setSearchProgress(n / pdf.numPages);
        }
        if (epoch === searchEpoch.current) setSearchProgress(null);
      } catch (e) {
        if (epoch === searchEpoch.current) {
          setSearchProgress(null);
          notify('搜索未完成：' + String(e));
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, pdf, getContent, notify]);
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
    if (writeNote) {
      setRight(true);
      setFocus(false);
      requestAnimationFrame(() =>
        window.document
          .querySelector<HTMLTextAreaElement>(`[data-note-id="${added[0].id}"]`)
          ?.focus(),
      );
    }
  }
  const removeMark = async (mark: Annotation) => {
    await annotations.remove(mark);
    setActiveMark(null);
    setDeleted(mark);
  };
  const editNote = (id: string) => {
    setActiveMark(null);
    setRight(true);
    setFocus(false);
    requestAnimationFrame(() =>
      window.document.querySelector<HTMLTextAreaElement>(`[data-note-id="${id}"]`)?.focus(),
    );
  };
  async function exportPDF() {
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
  }
  async function exportNotes() {
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
  }
  const toggleBookmark = () => {
    const next = bookmarks.includes(page)
      ? bookmarks.filter((n) => n !== page)
      : [...bookmarks, page].sort((a, b) => a - b);
    setBookmarks(next);
    const bookmarkLocations = { ...bookRef.current.bookmarkLocations };
    if (next.includes(page)) bookmarkLocations[page] = captureCurrent();
    else delete bookmarkLocations[page];
    onUpdate({ ...bookRef.current, bookmarks: next, bookmarkLocations });
  };
  const readerDark = settings.readerTheme === 'dark' || (settings.readerTheme === 'follow' && dark);
  return (
    <div className={`reader ${focus ? 'reader-focus' : ''}`}>
      <header
        className={`reader-header ${window.desktop?.platform === 'darwin' ? 'native-mac' : ''}`}
      >
        <IconButton label="返回书架" onClick={onClose}>
          <ArrowLeft size={18} />
        </IconButton>
        <div className="tool-group reader-navigation">
          <IconButton
            label="文档导航"
            active={left && tab !== 'search'}
            onClick={() => {
              setLeft(!(left && tab !== 'search'));
              if (tab === 'search') setTab('pages');
            }}
          >
            <PanelLeft size={18} />
          </IconButton>
          <IconButton
            label="搜索 PDF"
            shortcut={window.desktop?.platform === 'darwin' ? '⌘F' : 'Ctrl+F'}
            active={left && tab === 'search'}
            onClick={() => {
              setLeft(!(left && tab === 'search'));
              setTab('search');
            }}
          >
            <Search size={17} />
          </IconButton>
          <IconButton label="返回刚才的位置" disabled={!history.length} onClick={returnToPrevious}>
            <History size={17} />
          </IconButton>
          <IconButton
            label={bookmarks.includes(page) ? '移除书签' : '添加书签'}
            active={bookmarks.includes(page)}
            onClick={toggleBookmark}
          >
            <Bookmark size={17} fill={bookmarks.includes(page) ? 'currentColor' : 'none'} />
          </IconButton>
        </div>
        <div className="reader-title" title={`${book.title} · ${book.author}`}>
          <strong>{book.title}</strong>
        </div>
        <div className="tool-group reader-zoom">
          <IconButton
            label="缩小"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            <Minus size={15} />
          </IconButton>
          <button className="zoom-label" onClick={() => setZoom(1)} title="适应宽度">
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            label="放大"
            disabled={zoom >= 2}
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
          >
            <Plus size={15} />
          </IconButton>
          <span className="toolbar-separator" />
        </div>
        <div className="tool-group reader-actions">
          <IconButton label="阅读笔记" active={right} onClick={() => setRight(!right)}>
            <NotebookPen size={18} />
          </IconButton>
          <IconButton label={dark ? '切换浅色模式' : '切换深色模式'} onClick={onToggleTheme}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <IconButton label="阅读偏好" onClick={onSettings}>
            <SlidersHorizontal size={17} />
          </IconButton>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="icon-button" aria-label="更多阅读操作">
                <MoreHorizontal size={18} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown" align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className="dropdown-item"
                  disabled={exporting}
                  onSelect={() => void exportPDF()}
                >
                  导出批注 PDF
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dropdown-item" onSelect={() => void exportNotes()}>
                  导出 Markdown 笔记
                </DropdownMenu.Item>
                <DropdownMenu.CheckboxItem
                  className="dropdown-item"
                  checked={continuousHighlight}
                  onCheckedChange={setContinuousHighlight}
                >
                  连续高亮{continuousHighlight ? ' ✓' : ''}
                </DropdownMenu.CheckboxItem>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <IconButton
            label={focus ? '退出专注阅读' : '专注阅读（F）'}
            active={focus}
            onClick={() => setFocus(!focus)}
          >
            {focus ? <Minimize size={17} /> : <Maximize size={17} />}
          </IconButton>
        </div>
      </header>
      <div className="reader-body">
        {left && !focus && (
          <aside className="reader-sidebar">
            {tab !== 'search' && (
              <div className="sidebar-tabs" role="tablist" aria-label="文档导航视图">
                <button
                  role="tab"
                  aria-selected={tab === 'pages'}
                  aria-label="页面缩略图"
                  onClick={() => setTab('pages')}
                >
                  页面
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'outline'}
                  aria-label="文档目录"
                  onClick={() => setTab('outline')}
                >
                  目录
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'bookmarks'}
                  aria-label="文档书签"
                  onClick={() => setTab('bookmarks')}
                >
                  书签
                </button>
              </div>
            )}
            {tab === 'search' ? (
              <>
                <div className="sidebar-search">
                  <Search size={15} />
                  <input
                    ref={searchInput}
                    placeholder="搜索文档中的文字"
                    aria-label="搜索文档内容"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="search-status">
                  {searchProgress !== null
                    ? `正在检索 ${Math.round(searchProgress * 100)}%`
                    : query
                      ? `${results.length} 处结果 · ${new Set(results.map((r) => r.page)).size} 页`
                      : '输入关键词，搜索所有页面'}
                </div>
                {searchProgress !== null && <progress max="1" value={searchProgress} />}
                <div className="sidebar-scroll">
                  {results.map((r) => (
                    <button
                      className={`search-result ${activeMatch?.page === r.page && activeMatch.offset === r.offset ? 'selected' : ''}`}
                      key={`${r.page}:${r.offset}`}
                      onClick={() => {
                        setActiveMatch({ page: r.page, offset: r.offset });
                        navigate(r.page, { page: r.page, ratio: 0, offset: r.offset, screenY: 32 });
                      }}
                    >
                      <strong>
                        第 {r.page} 页 <span>{r.count} 处</span>
                      </strong>
                      <p>{r.excerpt}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : tab === 'outline' ? (
              <div className="sidebar-scroll">
                {outline.length ? (
                  outline.map((o, i) => (
                    <button
                      className={`outline-item ${i === outline.reduce((last, item, index) => (item.page <= page ? index : last), -1) ? 'selected' : ''}`}
                      key={i}
                      style={{ paddingLeft: 16 + o.depth * 12 }}
                      onClick={() => navigate(o.page, o.location)}
                    >
                      {o.title}
                      <span>{o.page}</span>
                    </button>
                  ))
                ) : (
                  <p className="sidebar-hint">此 PDF 没有内嵌目录。可以为常读的页面添加书签。</p>
                )}
              </div>
            ) : tab === 'bookmarks' ? (
              <div className="sidebar-scroll">
                <h4>
                  我的书签 <span>{bookmarks.length}</span>
                </h4>
                {bookmarks.map((n) => (
                  <button
                    className="outline-item"
                    key={n}
                    onClick={() => navigate(n, bookRef.current.bookmarkLocations?.[n])}
                  >
                    <Bookmark size={13} />第 {n} 页
                    <span>
                      <ArrowUpRight size={12} />
                    </span>
                  </button>
                ))}
                {!bookmarks.length && (
                  <p className="sidebar-hint">点击工具栏的书签图标，留住这一页。</p>
                )}
              </div>
            ) : (
              <div className="sidebar-scroll thumbnails">
                {pdf &&
                  Array.from({ length: pdf.numPages }, (_, i) => (
                    <Thumbnail
                      key={i + 1}
                      pdf={pdf}
                      number={i + 1}
                      active={i + 1 === page}
                      revealKey={jump.revision}
                      onClick={() => navigate(i + 1)}
                    />
                  ))}
              </div>
            )}
          </aside>
        )}
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
              <button className="primary" onClick={onClose}>
                返回书架
              </button>
            </div>
          ) : !pdf ? (
            <Spinner text="正在打开 PDF…" />
          ) : (
            <PDFViewport
              ref={viewer}
              pdf={pdf}
              getContent={getContent}
              marks={marks}
              zoom={zoom}
              mode={layout}
              dark={readerDark && !settings.originalColors}
              query={query}
              activeMatch={activeMatch}
              onMarkClick={setActiveMark}
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
        {right && !focus && (
          <aside className="notes-panel">
            <div className="notes-heading">
              <h3>
                阅读笔记 <span>{marks.length}</span>
              </h3>
              <IconButton label="关闭笔记" onClick={() => setRight(false)}>
                <X size={16} />
              </IconButton>
            </div>
            <button
              className="notes-export"
              disabled={!marks.length}
              onClick={() => void exportNotes()}
            >
              <Download size={14} />
              导出 Markdown 笔记
            </button>
            <div className="note-history">
              <button
                className="secondary"
                disabled={!annotations.history.undo}
                onClick={() => void annotations.undo()}
              >
                <Undo2 size={14} />
                撤销
              </button>
              <button
                className="secondary"
                disabled={!annotations.history.redo}
                onClick={() => void annotations.redo()}
              >
                <Redo2 size={14} />
                重做
              </button>
            </div>
            <div className="notes-list">
              {[...marks]
                .sort((a, b) => a.page - b.page || a.start - b.start || a.createdAt - b.createdAt)
                .map((mark) => (
                  <div
                    className={`note-card ${mark.page === page ? 'current-page' : ''}`}
                    key={mark.id}
                  >
                    <div className="note-card-top">
                      <button
                        onClick={() =>
                          navigate(mark.page, {
                            page: mark.page,
                            ratio: 0,
                            offset: mark.start,
                            screenY: 32,
                          })
                        }
                      >
                        第 {mark.page} 页 <ArrowUpRight size={12} />
                      </button>
                      <span style={{ color: colors[mark.color] }}>
                        {mark.kind === 'highlight' ? (
                          <Highlighter size={13} />
                        ) : (
                          <Underline size={13} />
                        )}
                      </span>
                      <IconButton label="删除这条批注" onClick={() => void removeMark(mark)}>
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                    <blockquote style={{ borderColor: colors[mark.color] }}>
                      {mark.quote}
                    </blockquote>
                    <NoteEditor mark={mark} save={annotations.note} />
                    <div className="note-format">
                      <select
                        aria-label="批注类型"
                        value={mark.kind}
                        onChange={(event) =>
                          void annotations.style(mark.id, { kind: event.target.value as MarkKind })
                        }
                      >
                        <option value="highlight">高光</option>
                        <option value="underline">划线</option>
                      </select>
                      <select
                        aria-label="批注颜色"
                        value={mark.color}
                        onChange={(event) =>
                          void annotations.style(mark.id, {
                            color: event.target.value as MarkColor,
                          })
                        }
                      >
                        <option value="amber">黄色</option>
                        <option value="green">绿色</option>
                        <option value="blue">蓝色</option>
                        <option value="pink">粉色</option>
                      </select>
                      <span className="note-date">
                        {new Date(mark.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>
                ))}
              {!marks.length && (
                <div className="notes-empty">
                  <Highlighter size={27} />
                  <strong>暂无批注</strong>
                  <p>
                    选中文字，添加高光或划线。
                    <br />
                    你的笔记会自动保存在这里。
                  </p>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="reader-status">
        <select
          className="layout-select"
          aria-label="阅读布局"
          value={layout}
          onChange={(event) => {
            const current = captureCurrent();
            setHistory((items) => [...items.slice(-49), current]);
            setLayout(event.target.value as ReadingLayout);
            setJump((j) => ({ ...current, revision: j.revision + 1 }));
          }}
        >
          <option value="continuous">连续滚动</option>
          <option value="single">单页</option>
          <option value="spread">双页</option>
        </select>
        <div className="page-controls">
          <IconButton
            label="上一页"
            disabled={layout === 'spread' ? page <= 2 : page <= 1}
            onClick={() => navigate(page - (layout === 'spread' ? 2 : 1))}
          >
            <ChevronLeft size={17} />
          </IconButton>
          <input
            aria-label="页码"
            type="number"
            min="1"
            max={pdf?.numPages || book.pages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => {
              navigate(Number(pageInput) || 1);
              setPageInput(String(Math.max(1, Math.min(book.pages, Number(pageInput) || 1))));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span>/ {pdf?.numPages || book.pages}</span>
          {pageLabels?.[page - 1] && pageLabels[page - 1] !== String(page) && (
            <span className="printed-page">· 印刷页 {pageLabels[page - 1]}</span>
          )}
          <IconButton
            label="下一页"
            disabled={
              layout === 'spread'
                ? Math.floor((page - 1) / 2) * 2 + 2 >= book.pages
                : page >= book.pages
            }
            onClick={() => navigate(page + (layout === 'spread' ? 2 : 1))}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        <div className="reading-progress">
          <span className="save-state" aria-live="polite">
            {annotations.status === 'saving'
              ? '保存中…'
              : annotations.status === 'saved'
                ? '已保存'
                : annotations.status === 'error'
                  ? '保存失败'
                  : ''}
          </span>
          <input
            type="range"
            aria-label="阅读进度"
            min="1"
            max={book.pages}
            value={previewPage ?? page}
            onChange={(event) => setPreviewPage(Number(event.target.value))}
            onPointerUp={(event) => {
              navigate(Number(event.currentTarget.value));
              setPreviewPage(null);
            }}
            onKeyUp={(event) => {
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key,
                )
              ) {
                navigate(Number(event.currentTarget.value));
                setPreviewPage(null);
              }
            }}
            onBlur={() => setPreviewPage(null)}
          />
          {previewPage && pdf && (
            <div className="progress-preview">
              <Thumbnail
                pdf={pdf}
                number={previewPage}
                active={false}
                onClick={() => {
                  navigate(previewPage);
                  setPreviewPage(null);
                }}
              />
            </div>
          )}
        </div>
      </footer>
      {continuousHighlight && (
        <div className="active-tool">
          <Highlighter size={14} style={{ color: colors[color] }} />
          连续高亮<button onClick={() => setContinuousHighlight(false)}>退出 · Esc</button>
        </div>
      )}
      {deleted && (
        <div className="undo-notice" role="status">
          已删除批注
          <button
            onClick={() => {
              void annotations.add([deleted]);
              setDeleted(null);
            }}
          >
            撤销
          </button>
        </div>
      )}
      {selection && (
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
      )}
      {activeMark && marks.some((m) => m.id === activeMark.id) && (
        <MarkTools
          mark={marks.find((m) => m.id === activeMark.id)!}
          position={activeMark}
          onColor={(next) => void annotations.style(activeMark.id, { color: next })}
          onNote={() => editNote(activeMark.id)}
          onClose={() => setActiveMark(null)}
          onDelete={() => void removeMark(marks.find((m) => m.id === activeMark.id)!)}
        />
      )}
    </div>
  );
}
function Thumbnail({
  pdf,
  number,
  active,
  revealKey,
  onClick,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  active: boolean;
  revealKey?: number;
  onClick: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (active) root.current?.scrollIntoView({ block: 'nearest' });
  }, [revealKey]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '150px' },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let canceled = false;
    let task: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    void pdf
      .getPage(number)
      .then((p) => {
        if (canceled || !canvas.current) return;
        const viewport = p.getViewport({ scale: 140 / p.getViewport({ scale: 1 }).width });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        task = p.render({ canvas: canvas.current, viewport });
        return task.promise;
      })
      .catch(() => {});
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [pdf, number, visible]);
  return (
    <button ref={root} className={`thumbnail ${active ? 'selected' : ''}`} onClick={onClick}>
      <canvas ref={canvas} />
      <span>{number}</span>
    </button>
  );
}

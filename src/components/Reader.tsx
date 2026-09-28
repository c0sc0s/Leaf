import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  BookOpen,
  PanelLeft,
  NotebookPen,
  Search,
  X,
  Highlighter,
  Underline,
  Copy,
  Trash2,
  Download,
  Bookmark,
  Minus,
  Plus,
  SlidersHorizontal,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Sun,
  Moon,
  Maximize,
  Minimize,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  Annotation,
  Book,
  DocumentContent,
  MarkColor,
  MarkKind,
  PageContent,
  Settings,
} from '../types';
import { loadPDF, extractPage } from '../lib/pdf';
import { analyzeDocument, CONTENT_VERSION } from '../lib/document';
import { storage } from '../lib/db';
import { colors, exportAnnotated, notesMarkdown, saveFile } from '../lib/export';
import type { DocumentSelection } from '../lib/selection';
import { PDFPage } from './PDFPage';
import { ReflowPage } from './ReflowPage';
import { IconButton, Spinner } from './UI';
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
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(book.page);
  const [pageInput, setPageInput] = useState(String(book.page));
  const [mode, setMode] = useState<'original' | 'reflow'>('original');
  const [content, setContent] = useState<PageContent | null>(null);
  const [marks, setMarks] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<DocumentSelection | null>(null);
  const [document, setDocument] = useState<DocumentContent | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [report, setReport] = useState(false);
  const modeChosen = useRef(false);
  const requestedMode = useRef<'original' | 'reflow' | null>(null);
  const [jump, setJump] = useState({ page: book.page, revision: 0 });
  const [color, setColor] = useState<MarkColor>('amber');
  const [left, setLeft] = useState(false);
  const [focus, setFocus] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [right, setRight] = useState(false);
  const [tab, setTab] = useState<'pages' | 'outline' | 'search'>('pages');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchProgress, setSearchProgress] = useState<number | null>(null);
  const [outline, setOutline] = useState<{ title: string; page: number; depth: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>(book.bookmarks || []);
  const cache = useRef(new Map<number, Promise<PageContent>>());
  const scroller = useRef<HTMLDivElement>(null);
  const bookRef = useRef(book);
  bookRef.current = book;
  const searchEpoch = useRef(0);
  const handleError = useCallback((message: string) => notify(message), [notify]);
  const switchMode = (next: 'original' | 'reflow') => {
    modeChosen.current = true;
    requestedMode.current = next;
    setSelection(null);
    if (next === 'reflow' && !document?.suitable) {
      setReport(true);
      return;
    }
    setJump((j) => ({ page: pageRef.current, revision: j.revision + 1 }));
    setMode(next);
    onUpdate({ ...bookRef.current, readingMode: next });
  };
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
        const native = await p.getOutline();
        if (native) {
          const items: { title: string; page: number; depth: number }[] = [];
          async function walk(entries: typeof native, depth: number) {
            for (const entry of entries!) {
              let dest = entry.dest;
              if (typeof dest === 'string') dest = await p!.getDestination(dest);
              let n = 1;
              if (Array.isArray(dest)) {
                const ref = dest[0];
                n = typeof ref === 'object' ? (await p!.getPageIndex(ref)) + 1 : Number(ref) + 1;
              }
              items.push({ title: entry.title, page: n, depth });
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
      if (!disposed) setMarks(a);
    });
    return () => {
      disposed = true;
      searchEpoch.current++;
      cache.current.clear();
      void (current?.loadingTask.destroy() || currentTask?.destroy());
    };
  }, [book.id, book.blob, askPassword]);
  useEffect(() => {
    if (!pdf) return;
    const controller = new AbortController();
    let disposed = false;
    void (async () => {
      try {
        let model = await storage.document(book.id).catch(() => undefined);
        if (disposed) return;
        if (!model || model.version !== CONTENT_VERSION || model.totalPages !== pdf.numPages) {
          model = await analyzeDocument(
            pdf,
            (n) => !disposed && setAnalysisProgress(n),
            controller.signal,
          );
          if (disposed) return;
          try {
            await storage.putDocument(book.id, model);
          } catch {
            notify('全书解析已完成，缓存保存失败；下次打开会重新分析。');
          }
        }
        if (disposed) return;
        setDocument(model);
        setAnalysisProgress(pdf.numPages);
        if (!modeChosen.current)
          setMode(model.suitable ? bookRef.current.readingMode || 'reflow' : 'original');
        else if (requestedMode.current === 'reflow' && model.suitable) setMode('reflow');
      } catch (error) {
        if (!disposed) {
          setDocument({
            version: CONTENT_VERSION,
            totalPages: pdf.numPages,
            pages: [],
            suitable: false,
            analyzedAt: Date.now(),
            issues: [{ page: 0, code: 'extraction', message: '全书分析未完成：' + String(error) }],
          });
          setMode('original');
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [pdf, book.id, notify]);
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
    if (!pdf) return;
    let disposed = false;
    setSelection(null);
    void getContent(page)
      .then((c) => {
        if (!disposed) setContent(c);
      })
      .catch((e) => {
        if (!disposed)
          setContent({
            page,
            text: '',
            tokens: [],
            blocks: [],
            source: 'text',
            tagged: false,
            columns: 1,
            warnings: ['本页文字提取失败：' + String(e)],
          });
      });
    const updated = { ...bookRef.current, page, openedAt: Date.now() };
    onUpdate(updated);
    return () => {
      disposed = true;
    };
  }, [pdf, page, getContent, onUpdate, mode]);
  useEffect(() => setPageInput(String(page)), [page]);
  useEffect(() => {
    if (mode !== 'reflow' || !document?.suitable) return;
    const frame = requestAnimationFrame(() =>
      scroller.current
        ?.querySelector(`[data-source-page="${jump.page}"]`)
        ?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [mode, document, jump]);
  const navigate = useCallback(
    (n: number) => {
      pageRef.current = Math.max(1, Math.min(book.pages, n));
      setPage(pageRef.current);
      setJump((j) => ({ page: Math.max(1, Math.min(book.pages, n)), revision: j.revision + 1 }));
    },
    [book.pages],
  );
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
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        const container = scroller.current;
        if (!container) return;
        const direction = e.key === 'PageDown' ? 1 : -1;
        const boundary =
          direction > 0
            ? container.scrollTop + container.clientHeight >= container.scrollHeight - 2
            : container.scrollTop <= 2;
        if (mode === 'original' && boundary) navigate(pageRef.current + direction);
        else container.scrollBy({ top: direction * container.clientHeight * 0.9 });
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(pageRef.current + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(pageRef.current - 1);
      }
      if (e.key === 'Escape') {
        setSelection(null);
        setFocus(false);
      }
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setFocus((value) => !value);
      }
    };
    window.document.addEventListener('keydown', listener);
    return () => window.document.removeEventListener('keydown', listener);
  }, [navigate, mode]);
  useEffect(() => {
    if (left && tab === 'search' && !focus) searchInput.current?.focus();
  }, [left, tab, focus]);
  useEffect(() => {
    const epoch = ++searchEpoch.current;
    setResults([]);
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
          const c = await getContent(n);
          if (epoch !== searchEpoch.current) return;
          const needle = query.toLowerCase();
          let pos = c.text.toLowerCase().indexOf(needle);
          if (pos >= 0) {
            const first = pos;
            let count = 0;
            while (pos >= 0) {
              count++;
              pos = c.text.toLowerCase().indexOf(needle, pos + needle.length);
            }
            found.push({
              page: n,
              count,
              excerpt:
                (first > 35 ? '…' : '') +
                c.text.slice(Math.max(0, first - 35), first + query.length + 80) +
                '…',
            });
            setResults([...found]);
          }
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
  async function annotate(kind: MarkKind) {
    if (!selection || !content) return;
    const added: Annotation[] = selection.anchors.map((anchor) => ({
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
      source: content.source,
    }));
    try {
      await storage.putAnnotations(added);
      setMarks((m) => [...m, ...added]);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      notify(kind === 'highlight' ? '已添加高光' : '已添加划线');
    } catch {
      notify('批注保存失败，请检查本机存储空间');
    }
  }
  async function removeMark(mark: Annotation) {
    try {
      await storage.deleteAnnotation(mark.id);
      setMarks((m) => m.filter((v) => v.id !== mark.id));
    } catch {
      notify('无法删除批注');
    }
  }
  async function note(mark: Annotation, value: string) {
    const next = { ...mark, note: value };
    try {
      await storage.putAnnotation(next);
      setMarks((m) => m.map((v) => (v.id === mark.id ? next : v)));
    } catch {
      notify('笔记保存失败');
    }
  }
  async function exportPDF() {
    setExporting(true);
    try {
      const data = await exportAnnotated(book.blob, marks);
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
          new TextEncoder().encode(notesMarkdown(book.title, marks)),
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
    onUpdate({ ...bookRef.current, bookmarks: next });
  };
  const pageMarks = useMemo(() => marks.filter((m) => m.page === page), [marks, page]);
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
            active={left && tab === 'search'}
            onClick={() => {
              setLeft(!(left && tab === 'search'));
              setTab('search');
            }}
          >
            <Search size={17} />
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
        <div className="segmented reader-mode">
          <button
            aria-pressed={mode === 'original'}
            className={mode === 'original' ? 'selected' : ''}
            onClick={() => switchMode('original')}
          >
            <FileText size={14} />
            原版阅读
          </button>
          <button
            aria-pressed={mode === 'reflow'}
            className={mode === 'reflow' ? 'selected' : ''}
            onClick={() => switchMode('reflow')}
          >
            <BookOpen size={14} />
            统一阅读
          </button>
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
          <IconButton label="导出批注 PDF" disabled={exporting} onClick={() => void exportPDF()}>
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
          </IconButton>
          <IconButton
            label={focus ? '退出专注阅读' : '专注阅读（F）'}
            active={focus}
            onClick={() => setFocus(!focus)}
          >
            {focus ? <Minimize size={17} /> : <Maximize size={17} />}
          </IconButton>
        </div>
      </header>
      {report && !focus && (
        <div className="document-report" role="region" aria-label="全书重排分析">
          <strong>
            {!document
              ? '正在检查全部页面'
              : document.suitable
                ? '全书可使用统一阅读'
                : '无法完整、可靠地重排整份文档'}
          </strong>
          <p>
            统一阅读按内容块连续排版，独立保留图片和图形。模式切换作用于整本；原版可随时用于核对。
          </p>
          {document?.issues.map((issue, i) => (
            <p key={i}>
              {issue.page ? `第 ${issue.page} 页：` : ''}
              {issue.message}
            </p>
          ))}
          {!document?.suitable && (
            <p>为避免遗漏内容，当前整本使用原版；不会插入整页截图补齐统一阅读。</p>
          )}
          <button onClick={() => setReport(false)}>收起说明</button>
        </div>
      )}
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
                  目录与书签
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
                      ? `${results.reduce((n, r) => n + r.count, 0)} 处结果 · ${results.length} 页`
                      : '输入关键词，搜索所有页面'}
                </div>
                {searchProgress !== null && <progress max="1" value={searchProgress} />}
                <div className="sidebar-scroll">
                  {results.map((r) => (
                    <button
                      className={`search-result ${page === r.page ? 'selected' : ''}`}
                      key={r.page}
                      onClick={() => {
                        navigate(r.page);
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
                      className={`outline-item ${o.page === page ? 'selected' : ''}`}
                      key={i}
                      style={{ paddingLeft: 16 + o.depth * 12 }}
                      onClick={() => navigate(o.page)}
                    >
                      {o.title}
                      <span>{o.page}</span>
                    </button>
                  ))
                ) : (
                  <p className="sidebar-hint">此 PDF 没有内嵌目录。可以为常读的页面添加书签。</p>
                )}
                <h4>
                  我的书签 <span>{bookmarks.length}</span>
                </h4>
                {bookmarks.map((n) => (
                  <button className="outline-item" key={n} onClick={() => navigate(n)}>
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
                      onClick={() => navigate(i + 1)}
                    />
                  ))}
              </div>
            )}
          </aside>
        )}
        <main
          ref={scroller}
          className={`reading-canvas ${readerDark ? 'reader-dark' : 'reader-light'} ${mode === 'reflow' ? 'reflow-mode' : ''}`}
          onScroll={() => {
            if (selection) setSelection(null);
            if (mode === 'reflow' && scroller.current) {
              const top = scroller.current.getBoundingClientRect().top + 40;
              const sections = [
                ...scroller.current.querySelectorAll<HTMLElement>('[data-source-page]'),
              ];
              const current =
                [...sections]
                  .reverse()
                  .find((section) => section.getBoundingClientRect().top <= top) || sections[0];
              if (current) setPage(Number(current.dataset.sourcePage));
            }
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
          ) : !pdf || !content ? (
            <Spinner text="正在打开你的阅读空间…" />
          ) : mode === 'original' ? (
            <PDFPage
              pdf={pdf}
              page={page}
              content={content}
              marks={pageMarks}
              zoom={zoom}
              dark={readerDark}
              onSelection={(anchor) =>
                setSelection(anchor ? { ...anchor, anchors: [{ ...anchor, page }] } : null)
              }
              onError={handleError}
            />
          ) : document?.suitable ? (
            <ReflowPage
              document={document}
              marks={marks}
              title={book.title}
              settings={settings}
              query={query}
              onSelection={setSelection}
              onOriginal={() => switchMode('original')}
            />
          ) : (
            <Spinner text="正在检查全书内容…" />
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
            <div className="notes-list">
              {[...marks]
                .sort((a, b) => a.page - b.page || a.start - b.start || a.createdAt - b.createdAt)
                .map((mark) => (
                  <div
                    className={`note-card ${mark.page === page ? 'current-page' : ''}`}
                    key={mark.id}
                  >
                    <div className="note-card-top">
                      <button onClick={() => navigate(mark.page)}>
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
                    <textarea
                      aria-label={`第 ${mark.page} 页批注笔记`}
                      defaultValue={mark.note}
                      placeholder="写下此刻的想法…"
                      onBlur={(e) => {
                        if (e.target.value !== mark.note) void note(mark, e.target.value);
                      }}
                    />
                    <div className="note-date">
                      {new Date(mark.createdAt).toLocaleDateString('zh-CN')}
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
        <div className="document-status">
          <button onClick={() => setReport(!report)} aria-expanded={report}>
            {!document
              ? `正在解析整份 PDF · ${analysisProgress} / ${book.pages} 页`
              : document.suitable
                ? `全书 ${document.totalPages} 页已检查 · 支持统一阅读`
                : `已检查 ${document.pages.length} / ${document.totalPages} 页 · 整本原版阅读`}
          </button>
          {!document && (
            <progress max={book.pages} value={analysisProgress} aria-label="全书解析进度" />
          )}
        </div>
        <div className="page-controls">
          <IconButton label="上一页" disabled={page <= 1} onClick={() => navigate(page - 1)}>
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
          <IconButton
            label="下一页"
            disabled={page >= book.pages}
            onClick={() => navigate(page + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        <div className="tool-group">
          {mode === 'original' && (
            <>
              <IconButton
                label="缩小"
                disabled={zoom <= 0.5}
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
              >
                <Minus size={15} />
              </IconButton>
              <button className="zoom-label" onClick={() => setZoom(1)} title="恢复适合页面">
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
            </>
          )}
        </div>
      </footer>
      {selection && (
        <div
          className="selection-toolbar"
          style={{ left: selection.x, top: selection.y }}
          onPointerDown={(e) => e.preventDefault()}
        >
          <div className="mark-colors">
            {(Object.keys(colors) as MarkColor[]).map((c) => (
              <button
                key={c}
                aria-label={`${c} 批注颜色`}
                title={c}
                style={{ background: colors[c] }}
                className={color === c ? 'selected' : ''}
                onClick={() => setColor(c)}
              >
                {color === c && <Check size={11} />}
              </button>
            ))}
          </div>
          <span className="toolbar-separator" />
          <IconButton label="高光标注" onClick={() => void annotate('highlight')}>
            <Highlighter size={18} />
          </IconButton>
          <IconButton label="划线标注" onClick={() => void annotate('underline')}>
            <Underline size={18} />
          </IconButton>
          <IconButton
            label="复制文字"
            onClick={() => {
              void navigator.clipboard
                .writeText(selection.quote)
                .then(() => notify('文字已复制'))
                .catch(() => notify('无法访问剪贴板'));
            }}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton label="关闭标注工具" onClick={() => setSelection(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
function Thumbnail({
  pdf,
  number,
  active,
  onClick,
}: {
  pdf: PDFDocumentProxy;
  number: number;
  active: boolean;
  onClick: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (active) root.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
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

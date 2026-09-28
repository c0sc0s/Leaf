import { useCallback, useEffect, useRef, useState } from 'react';
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
  ScanText,
  List,
  LayoutGrid,
  ArrowUpRight,
  Check,
  LoaderCircle,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, Book, MarkColor, MarkKind, PageContent, Settings } from '../types';
import { loadPDF, extractPage, ocrPage } from '../lib/pdf';
import { storage } from '../lib/db';
import { colors, exportAnnotated, notesMarkdown, saveFile } from '../lib/export';
import type { SelectionAnchor } from '../lib/selection';
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
  notify,
  askPassword,
}: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(book.page);
  const [pageInput, setPageInput] = useState(String(book.page));
  const [mode, setMode] = useState<'original' | 'reflow'>('original');
  const [content, setContent] = useState<PageContent | null>(null);
  const [marks, setMarks] = useState<Annotation[]>([]);
  const [selection, setSelection] = useState<SelectionAnchor | null>(null);
  const [color, setColor] = useState<MarkColor>('amber');
  const [left, setLeft] = useState(false);
  const [right, setRight] = useState(false);
  const [tab, setTab] = useState<'pages' | 'outline' | 'search'>('pages');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchProgress, setSearchProgress] = useState<number | null>(null);
  const [outline, setOutline] = useState<{ title: string; page: number; depth: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>(book.bookmarks || []);
  const cache = useRef(new Map<number, Promise<PageContent>>());
  const scroller = useRef<HTMLDivElement>(null);
  const bookRef = useRef(book);
  bookRef.current = book;
  const searchEpoch = useRef(0);
  const closing = useRef(false);
  const handleError = useCallback((message: string) => notify(message), [notify]);
  useEffect(() => {
    closing.current = false;
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
      closing.current = true;
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
        value = storage.ocr(book.id, n).then((saved) => saved || extractPage(pdf, n));
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
    setContent(null);
    setSelection(null);
    setPageInput(String(page));
    scroller.current?.scrollTo(0, 0);
    void getContent(page)
      .then((c) => {
        if (!disposed) setContent(c);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    const updated = { ...bookRef.current, page, openedAt: Date.now() };
    onUpdate(updated);
    return () => {
      disposed = true;
    };
  }, [pdf, page, getContent, onUpdate]);
  const navigate = useCallback(
    (n: number) => {
      setPage(Math.max(1, Math.min(book.pages, n)));
    },
    [book.pages],
  );
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('input,textarea,select,[contenteditable]')
      )
        return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        navigate(page + 1);
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        navigate(page - 1);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setLeft(true);
        setTab('search');
      }
      if (e.key === 'Escape') setSelection(null);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [navigate, page]);
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
    const mark: Annotation = {
      id: crypto.randomUUID(),
      bookId: book.id,
      page,
      start: selection.start,
      end: selection.end,
      quote: selection.quote,
      rects: selection.rects,
      kind,
      color,
      note: '',
      createdAt: Date.now(),
      source: content.source,
    };
    try {
      await storage.putAnnotation(mark);
      setMarks((m) => [...m, mark]);
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
  async function runOCR() {
    if (!pdf || ocrProgress !== null) return;
    setOcrProgress(0);
    try {
      const c = await ocrPage(pdf, page, setOcrProgress);
      if (closing.current) return;
      await storage.putOCR(book.id, c);
      cache.current.set(page, Promise.resolve(c));
      setContent(c);
      if (!c.tokens.length) notify('未识别到文字，可尝试更清晰的扫描件');
      else notify('本页文字识别完成');
    } catch (e) {
      if (!closing.current) notify('OCR 未完成，请重试或换用更清晰的扫描件：' + String(e));
    } finally {
      if (!closing.current) setOcrProgress(null);
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
  const pageMarks = marks.filter((m) => m.page === page);
  const readerDark = settings.readerTheme === 'dark' || (settings.readerTheme === 'follow' && dark);
  return (
    <div className="reader">
      <header className="reader-header">
        <div className="reader-title">
          <IconButton label="返回书架" onClick={onClose}>
            <ArrowLeft size={20} />
          </IconButton>
          <span className="reader-title-divider" />
          <div>
            <strong>{book.title}</strong>
            <span>{book.author}</span>
          </div>
        </div>
        <div className="segmented reader-mode">
          <button
            className={mode === 'original' ? 'selected' : ''}
            onClick={() => {
              setMode('original');
              setSelection(null);
            }}
          >
            <FileText size={15} />
            原版阅读
          </button>
          <button
            className={mode === 'reflow' ? 'selected' : ''}
            onClick={() => {
              setMode('reflow');
              setSelection(null);
            }}
          >
            <BookOpen size={15} />
            舒适阅读
          </button>
        </div>
        <div className="tool-group">
          <IconButton label="阅读偏好" onClick={onSettings}>
            <SlidersHorizontal size={18} />
          </IconButton>
          <IconButton label="导出批注 PDF" disabled={exporting} onClick={() => void exportPDF()}>
            {exporting ? <LoaderCircle size={18} className="spin" /> : <Download size={18} />}
          </IconButton>
        </div>
      </header>
      <div className="reader-toolbar">
        <div className="tool-group">
          <IconButton label="目录与搜索" active={left} onClick={() => setLeft(!left)}>
            <PanelLeft size={18} />
          </IconButton>
          <IconButton
            label="搜索 PDF"
            active={left && tab === 'search'}
            onClick={() => {
              setLeft(true);
              setTab('search');
            }}
          >
            <Search size={17} />
          </IconButton>
          <span className="toolbar-separator" />
          <IconButton
            label={bookmarks.includes(page) ? '移除书签' : '添加书签'}
            active={bookmarks.includes(page)}
            onClick={toggleBookmark}
          >
            <Bookmark size={17} fill={bookmarks.includes(page) ? 'currentColor' : 'none'} />
          </IconButton>
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
          <IconButton label="阅读笔记" active={right} onClick={() => setRight(!right)}>
            <NotebookPen size={18} />
          </IconButton>
          <span className="note-number">{marks.length}</span>
        </div>
      </div>
      <div className="reader-body">
        {left && (
          <aside className="reader-sidebar">
            <div className="sidebar-tabs">
              <IconButton
                label="页面缩略图"
                active={tab === 'pages'}
                onClick={() => setTab('pages')}
              >
                <LayoutGrid size={17} />
              </IconButton>
              <IconButton
                label="文档目录"
                active={tab === 'outline'}
                onClick={() => setTab('outline')}
              >
                <List size={18} />
              </IconButton>
              <IconButton
                label="文内搜索"
                active={tab === 'search'}
                onClick={() => setTab('search')}
              >
                <Search size={17} />
              </IconButton>
              <IconButton label="关闭目录" onClick={() => setLeft(false)}>
                <X size={16} />
              </IconButton>
            </div>
            {tab === 'search' ? (
              <>
                <div className="sidebar-search">
                  <Search size={15} />
                  <input
                    autoFocus
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
                        setMode('reflow');
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
                <h4>文档目录</h4>
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
          onScroll={() => selection && setSelection(null)}
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
              onSelection={setSelection}
              onError={handleError}
            />
          ) : (
            <ReflowPage
              content={content}
              marks={pageMarks}
              title={book.title}
              settings={settings}
              query={query}
              onSelection={setSelection}
              onOCR={() => void runOCR()}
              onOriginal={() => setMode('original')}
              ocrProgress={ocrProgress}
            />
          )}
        </main>
        {right && (
          <aside className="notes-panel">
            <div className="notes-heading">
              <h3>
                页边的思考 <span>{marks.length}</span>
              </h3>
              <IconButton label="关闭笔记" onClick={() => setRight(false)}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="notes-description">读过的文字，留下的想法。</div>
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
                  <strong>有些句子值得停留</strong>
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
        <span>
          <span className="status-dot" />
          已保存在本机
        </span>
        <span>
          {mode === 'original'
            ? '原版排版'
            : content?.source === 'ocr'
              ? 'OCR · 舒适排版'
              : '文字重排'}{' '}
          · {content?.text.trim().length || 0} 字
        </span>
        <span>{Math.round((page / book.pages) * 100)}% 已读</span>
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
      {content?.source === 'ocr' && mode === 'original' && (
        <div className="ocr-badge">
          <ScanText size={14} />
          OCR 文字层
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

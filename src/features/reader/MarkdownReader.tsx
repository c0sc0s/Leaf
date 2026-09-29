import { PageSkeleton } from './PageSkeleton';
import { useDelayed } from '../../lib/useDelayed';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence } from 'motion/react';
import type { ReaderProps } from './BookReader';
import { useReadingPersistence } from './hooks/useReadingPersistence';
import { useReaderShortcuts } from './hooks/useReaderShortcuts';
import { initialReadingState } from '@/lib/position';
import { resolveBookLink } from '@/lib/markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Exiting, IconButton } from '@/components/UI';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Minus,
  NotebookPen,
  PanelLeft,
  Plus,
  Search,
  Settings2,
} from '@/components/icons';
import './markdown.css';
import { MarkdownContent } from './MarkdownContent';
import { useMarkdownDocument } from './hooks/useMarkdownDocument';
import { ReaderSidebar, type SidebarTab } from './sidebar/ReaderSidebar';
import { OutlineTreeView } from './sidebar/OutlineTree';
import { BookmarkList } from './sidebar/BookmarkList';
import { SelectionTools, MarkTools } from './AnnotationTools';
import { NotesPanel } from './NotesPanel';
import { useMarkdownAnnotations } from './useMarkdownAnnotations';
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
};

export function MarkdownReader({
  book,
  settings,
  dark,
  onClose,
  onUpdate,
  onSettings,
  notify,
}: ReaderProps) {
  const chapters = useMemo(() => book.chapters || [], [book.chapters]);
  const [saved] = useState(() => initialReadingState(book));
  const [page, setPage] = useState(saved.page);
  const [zoom, setZoom] = useState(saved.zoom);
  const [left, setLeft] = useState(true);
  const [focus, setFocus] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<SidebarTab>('outline');
  const [activeHeading, setActiveHeading] = useState('');
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [jump, setJump] = useState({ revision: 0, hash: '', search: false });
  const scroller = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const annotation = useMarkdownAnnotations(book.id, page, article, notify);
  const pendingAnnotation = useRef<number | null>(null);
  const selectedMark =
    annotation.active &&
    annotation.annotations.marks.find((mark) => mark.id === annotation.active!.id);
  const input = useRef<HTMLInputElement>(null);
  const current = useRef({ book, page, zoom, ratio: saved.ratio });
  current.current = { ...current.current, book, page, zoom };
  const pendingRatio = useRef(saved.ratio);
  const restoring = useRef(true);
  const chapter = chapters[page - 1];
  const readerDark = settings.readerTheme === 'dark' || (settings.readerTheme === 'follow' && dark);
  const renderQuery = useDeferredValue(searching ? query : '');
  const document = useMarkdownDocument(chapters, page, renderQuery, annotation.pageMarks, notify);
  const { tree, results, error, ready } = document;
  // Keep the previous chapter up briefly instead of flashing an empty page between chapters.
  const slowChapter = useDelayed(!tree && document.previous ? page : null, 250) !== null;
  const shown = tree
    ? { tree, path: chapter.path }
    : document.previous && !slowChapter
      ? { tree: document.previous.tree, path: chapters[document.previous.page - 1].path }
      : null;
  const chapterItems = useMemo(
    () =>
      chapters.map((entry, index) => ({
        title: entry.title,
        page: index + 1,
        depth: 0,
        hash: '',
      })),
    [chapters],
  );
  const outline = document.outline.length ? document.outline : chapterItems;
  const activeOutline = outline.findIndex(
    (item) => item.page === page && item.hash === activeHeading,
  );
  const headingKeys = useMemo(
    () => new Set(outline.filter((item) => item.page === page).map((item) => item.hash)),
    [outline, page],
  );
  const headingNodes = useRef<HTMLElement[]>([]);
  const headingFrame = useRef(0);
  const restored = useRef('');
  const openLink = useRef<(href: string) => void>(() => {});
  openLink.current = (href) => {
    if (!chapter) return;
    const link = resolveBookLink(chapter.path, href);
    if (link) {
      const index = chapters.findIndex((entry) => entry.path === link.path);
      if (index >= 0) navigate(index + 1, link.hash);
      else notify('链接指向的文件未包含在这本书中');
    } else if (/^https?:\/\//i.test(href)) {
      if (window.desktop)
        void window.desktop.openExternal(href).catch(() => notify('无法打开链接'));
      else window.open(href, '_blank', 'noopener,noreferrer');
    }
  };
  const handleLink = useCallback((href: string) => openLink.current(href), []);
  const handleImageLoad = useCallback(() => {
    if (restoring.current && scroller.current) {
      const container = scroller.current;
      container.scrollTop =
        pendingRatio.current * Math.max(0, container.scrollHeight - container.clientHeight);
    }
  }, []);
  useEffect(() => {
    if (annotation.right) setFocus(false);
  }, [annotation.right]);

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const asset of book.assets || []) {
      const type = imageTypes[asset.path.split('.').at(-1)!.toLowerCase()];
      urls[asset.path] = URL.createObjectURL(new Blob([asset.blob], { type }));
    }
    setAssets(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [book.assets]);

  const schedulePersistence = useReadingPersistence({
    bookId: book.id,
    page,
    enabled: !!tree,
    capture: () => ({
      page: current.current.page,
      ratio: current.current.ratio,
      zoom: current.current.zoom,
      layout: { continuous: true, spread: false },
    }),
    onProgress: (page, openedAt) => onUpdate({ ...current.current.book, page, openedAt }),
    notify,
  });

  useLayoutEffect(() => {
    headingNodes.current = [
      ...(article.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6') || []),
    ].filter((node) => headingKeys.has(node.id));
    updateActiveHeading();
  }, [tree, headingKeys]);
  useEffect(() => () => cancelAnimationFrame(headingFrame.current), []);

  useLayoutEffect(() => {
    const container = scroller.current;
    const content = article.current;
    const key = page + ':' + jump.revision + ':' + zoom;
    if (!container || !content || !ready || restored.current === key) return;
    restored.current = key;
    const anchor = jump.hash
      ? [...content.querySelectorAll<HTMLElement>('[id]')].find(
          (node) => node.id === 'md-' + jump.hash || node.id === jump.hash,
        )
      : null;
    const match =
      pendingAnnotation.current !== null
        ? [...content.querySelectorAll<HTMLElement>('[data-md-start]')].find(
            (node) =>
              Number(node.dataset.mdStart) <= pendingAnnotation.current! &&
              Number(node.dataset.mdEnd) > pendingAnnotation.current!,
          )
        : jump.search
          ? content.querySelector('mark')
          : null;
    pendingAnnotation.current = null;
    if (anchor || match) {
      (anchor || match)?.scrollIntoView({ block: 'start' });
      restoring.current = false;
    } else {
      container.scrollTop =
        pendingRatio.current * Math.max(0, container.scrollHeight - container.clientHeight);
    }
    current.current.ratio =
      container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
    updateActiveHeading();
  }, [page, jump, zoom, tree, ready]);

  function navigate(next: number, hash = '', search = false) {
    annotation.dismiss();
    window.getSelection()?.removeAllRanges();
    const target = Math.max(1, Math.min(chapters.length, next));
    pendingRatio.current = 0;
    restoring.current = false;
    current.current = { ...current.current, page: target, ratio: 0 };
    setPage(target);
    setActiveHeading(hash);
    setJump((value) => ({ revision: value.revision + 1, hash, search }));
  }
  function updateActiveHeading() {
    const container = scroller.current;
    if (!container || !article.current) return;
    const atEnd =
      container.scrollTop > 0 &&
      container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
    const bounds = container.getBoundingClientRect();
    const top = atEnd ? bounds.bottom : bounds.top + 32;
    // Heading positions stay ordered. Find the current one with O(log n) reads,
    // instead of measuring every heading and rescanning the outline on each scroll.
    let left = 0;
    let right = headingNodes.current.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (headingNodes.current[middle].getBoundingClientRect().top <= top) left = middle + 1;
      else right = middle;
    }
    setActiveHeading(headingNodes.current[left - 1]?.id || '');
  }
  useReaderShortcuts({
    search: () => {
      setSearching(true);
      setLeft(true);
      setFocus(false);
    },
    undo: () => void annotation.annotations.undo(),
    redo: () => void annotation.annotations.redo(),
    zoomIn: () => adjustZoom(zoom + 0.1),
    zoomOut: () => adjustZoom(zoom - 0.1),
    resetZoom: () => adjustZoom(1),
    page: (direction) => navigate(page + direction),
    screen: (direction) => navigate(page + direction),
    escape: () => {
      setFocus(false);
      annotation.dismiss();
    },
    toggleFocus: () => setFocus((value) => !value),
  });
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);
  const bookmarked = book.bookmarks?.includes(page);
  const bookmark = () =>
    onUpdate({
      ...book,
      bookmarks: bookmarked
        ? book.bookmarks!.filter((value) => value !== page)
        : [...(book.bookmarks || []), page].sort((a, b) => a - b),
    });
  const adjustZoom = (value: number) => {
    const container = scroller.current;
    pendingRatio.current = container
      ? container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight)
      : 0;
    setZoom(Math.max(0.5, Math.min(2, value)));
  };

  return (
    <div className={`reader markdown-reader ${focus ? 'reader-focus' : ''}`}>
      <header
        className={`reader-header ${window.desktop?.platform === 'darwin' ? 'native-mac' : window.desktop?.platform === 'win32' ? 'native-win' : ''}`}
      >
        <div className="reader-header-start">
          <IconButton label="返回书架" onClick={onClose}>
            <ArrowLeft size={18} />
          </IconButton>
          <div className="tool-group reader-navigation">
            <IconButton
              label="文档导航"
              active={left && !searching}
              onClick={() => {
                setSearching(false);
                setLeft(!left || searching);
              }}
            >
              <PanelLeft size={18} />
            </IconButton>
            <IconButton
              label="搜索 Markdown"
              active={searching && left}
              onClick={() => {
                setLeft(true);
                setSearching(!searching);
              }}
            >
              <Search size={17} />
            </IconButton>
            <IconButton
              label={bookmarked ? '移除书签' : '添加书签'}
              active={bookmarked}
              onClick={bookmark}
            >
              <Bookmark size={17} fill={bookmarked ? 'currentColor' : 'none'} />
            </IconButton>
          </div>
        </div>
        <div className="reader-title" title={book.title}>
          <strong>{book.title}</strong>
        </div>
        <div className="reader-header-end">
          <div className="tool-group reader-zoom">
            <IconButton label="缩小" disabled={zoom <= 0.5} onClick={() => adjustZoom(zoom - 0.1)}>
              <Minus size={15} />
            </IconButton>
            <Button
              variant="ghost"
              className="zoom-label"
              title="重置字号"
              onClick={() => adjustZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </Button>
            <IconButton label="放大" disabled={zoom >= 2} onClick={() => adjustZoom(zoom + 0.1)}>
              <Plus size={15} />
            </IconButton>
          </div>
          <div className="tool-group reader-actions">
            <IconButton
              label="阅读笔记"
              active={annotation.right}
              onClick={() => annotation.setRight(!annotation.right)}
            >
              <NotebookPen size={17} />
            </IconButton>
            <IconButton label="阅读偏好" onClick={onSettings}>
              <Settings2 size={17} />
            </IconButton>
            <IconButton
              label={focus ? '退出专注阅读' : '专注阅读（F）'}
              active={focus}
              onClick={() => setFocus(!focus)}
            >
              {focus ? <Minimize size={17} /> : <Maximize size={17} />}
            </IconButton>
          </div>
        </div>
      </header>
      <div className="reader-body">
        {left && !focus && (
          <ReaderSidebar
            tab={searching ? 'search' : tab}
            pagesLabel="章节列表"
            onTab={(value) => {
              setSearching(false);
              setTab(value);
            }}
          >
            {searching ? (
              <>
                <div className="markdown-search">
                  <Input
                    ref={input}
                    aria-label="搜索 Markdown 内容"
                    placeholder="搜索整本书…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className="sidebar-scroll">
                  {query.trim() && (
                    <p className="markdown-section-label">{results.length} 个章节匹配</p>
                  )}
                  {query.trim() &&
                    results.map((result) => (
                      <Button
                        key={result.page}
                        variant="ghost"
                        className="markdown-search-result"
                        onClick={() => navigate(result.page, '', true)}
                      >
                        <strong>{result.title}</strong>
                        <span>{result.snippet}</span>
                      </Button>
                    ))}
                </div>
              </>
            ) : tab === 'bookmarks' ? (
              <BookmarkList
                bookmarks={book.bookmarks || []}
                labels={Object.fromEntries(
                  chapters.map((entry, index) => [index + 1, entry.title]),
                )}
                onSelect={navigate}
              />
            ) : (
              <OutlineTreeView
                items={tab === 'pages' ? chapterItems : outline}
                active={tab === 'pages' ? page - 1 : activeOutline}
                onChoose={(node) => {
                  const item = (tab === 'pages' ? chapterItems : outline)[node.index];
                  navigate(item.page, item.hash);
                }}
              />
            )}
          </ReaderSidebar>
        )}
        <div
          ref={scroller}
          className={`markdown-scroll ${readerDark ? 'markdown-dark' : ''}`}
          onWheel={() => {
            restoring.current = false;
          }}
          onPointerDown={() => {
            restoring.current = false;
          }}
          onScroll={(event) => {
            const container = event.currentTarget;
            current.current.ratio =
              container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
            schedulePersistence();
            if (!headingFrame.current) {
              headingFrame.current = requestAnimationFrame(() => {
                headingFrame.current = 0;
                updateActiveHeading();
              });
            }
          }}
        >
          <article
            ref={article}
            className={`markdown-content typeset typeset-docs max-w-[42em] ${tree ? '' : 'stale'}`}
            style={{ '--typeset-size': `${18 * zoom}px` } as CSSProperties}
            aria-label={chapter?.title || 'Markdown 正文'}
            onClick={(event) => annotation.openMark(event.target as HTMLElement)}
          >
            {chapter ? (
              error ? (
                <p role="alert">无法读取这一章：{error}</p>
              ) : shown ? (
                <MarkdownContent
                  tree={shown.tree}
                  path={shown.path}
                  assets={assets}
                  onLink={handleLink}
                  onImageLoad={handleImageLoad}
                />
              ) : (
                <PageSkeleton label="正在读取章节…" paper={false} />
              )
            ) : (
              <p>这本书没有可阅读的 Markdown 章节。</p>
            )}
          </article>
        </div>
        {annotation.right && !focus && (
          <NotesPanel
            unit="章"
            marks={annotation.annotations.marks}
            page={page}
            activeId={annotation.active?.id || null}
            onNote={annotation.annotations.note}
            onStyle={(id, changes) => void annotation.annotations.style(id, changes)}
            onRemove={(mark) => void annotation.remove(mark)}
            onNavigate={(next, location) => {
              pendingAnnotation.current = location?.offset ?? null;
              navigate(next);
            }}
            onClose={() => annotation.setRight(false)}
          />
        )}
      </div>
      <footer className="reader-status markdown-status">
        <span>Markdown</span>
        <div className="page-controls">
          <IconButton label="上一章" disabled={page <= 1} onClick={() => navigate(page - 1)}>
            <ChevronLeft size={17} />
          </IconButton>
          <span>
            第 {page} / {chapters.length} 章
          </span>
          <IconButton
            label="下一章"
            disabled={page >= chapters.length}
            onClick={() => navigate(page + 1)}
          >
            <ChevronRight size={17} />
          </IconButton>
        </div>
        <span className="markdown-current-path" title={chapter?.path}>
          {chapter?.path}
        </span>
      </footer>
      <AnimatePresence>
        {annotation.selection && (
          <Exiting key="selection">
            <SelectionTools
              selection={annotation.selection}
              color={annotation.color}
              onColor={annotation.setColor}
              onAnnotate={(kind, note) => {
                if (note) setFocus(false);
                void annotation.annotate(kind, note);
              }}
              onClose={annotation.dismiss}
              onCopy={() =>
                void navigator.clipboard
                  .writeText(annotation.selection!.quote)
                  .then(() => notify('文字已复制'))
                  .catch(() => notify('无法访问剪贴板'))
              }
            />
          </Exiting>
        )}
        {annotation.active && selectedMark && (
          <Exiting key={annotation.active.id}>
            <MarkTools
              mark={selectedMark}
              position={annotation.active}
              onColor={(color) => void annotation.annotations.style(selectedMark.id, { color })}
              onNote={() => {
                setFocus(false);
                annotation.focusNote(selectedMark.id);
              }}
              onDelete={() => void annotation.remove(selectedMark)}
              onClose={() => annotation.setActive(null)}
            />
          </Exiting>
        )}
      </AnimatePresence>
    </div>
  );
}

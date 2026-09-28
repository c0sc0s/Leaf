import {
  Search,
  Plus,
  ArrowUpRight,
  Heart,
  MoreHorizontal,
  BookOpen,
  Grid2X2,
  List,
  Trash2,
  ArrowDownUp,
  X,
  Highlighter,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Book } from '../types';
import { IconButton } from './UI';
export type LibraryView =
  'all' | 'recent' | 'favorites' | 'notes' | '设计与灵感' | '技术与思考' | '生活与阅读';
const viewNames: Record<LibraryView, string> = {
  all: '我的书架',
  recent: '最近阅读',
  favorites: '心头好',
  notes: '阅读笔记',
  设计与灵感: '设计与灵感',
  技术与思考: '技术与思考',
  生活与阅读: '生活与阅读',
};
export function Library({
  books,
  view,
  noteCounts,
  onImport,
  onOpen,
  onUpdate,
  onDelete,
}: {
  books: Book[];
  view: LibraryView;
  noteCounts: Record<string, number>;
  onImport: () => void;
  onOpen: (b: Book) => void;
  onUpdate: (b: Book) => void;
  onDelete: (b: Book) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('added');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [menu, setMenu] = useState<string | null>(null);
  const filtered = useMemo(
    () =>
      books
        .filter(
          (b) =>
            (view === 'all' ||
              (view === 'recent' && b.openedAt > 0) ||
              (view === 'favorites' && b.favorite) ||
              (view === 'notes' && noteCounts[b.id] > 0) ||
              view === b.category) &&
            `${b.title} ${b.author} ${b.filename}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'title'
            ? a.title.localeCompare(b.title)
            : sort === 'opened' || view === 'recent'
              ? b.openedAt - a.openedAt
              : b.addedAt - a.addedAt,
        ),
    [books, view, query, sort, noteCounts],
  );
  const recent = [...books]
    .filter((b) => b.openedAt > 0)
    .sort((a, b) => b.openedAt - a.openedAt)[0];
  return (
    <div className="library" onClick={() => menu && setMenu(null)}>
      <header className="library-heading">
        <div>
          <div className="eyebrow">YOUR PERSONAL READING SPACE</div>
          <h1>
            {viewNames[view]}
            <span className="heading-dot">.</span>
          </h1>
          <p>一本好书，一点留白，一段属于自己的时间。</p>
        </div>
        <button className="primary" onClick={onImport}>
          <Plus size={17} />
          导入 PDF
        </button>
      </header>
      {view === 'all' && (
        <div className="library-intro">
          <div className="intro-label">
            <BookOpen size={19} />
            <span>慢一点，读进去。</span>
          </div>
          <div className="intro-copy">把灵感收进书架，让思考留在页边。</div>
          <span className="intro-number">FOLIO / 01</span>
        </div>
      )}
      {view === 'all' && recent && (
        <button className="continue-reading" onClick={() => onOpen(recent)}>
          <img src={recent.cover} alt="" />
          <div>
            <span className="eyebrow">接着上次的思绪</span>
            <strong>{recent.title}</strong>
            <span className="muted">
              第 {recent.page} / {recent.pages} 页 · 继续阅读
            </span>
          </div>
          <ArrowUpRight size={22} />
        </button>
      )}
      <div className="library-tools">
        <div className="library-tabs">
          <span className="active">
            {view === 'notes' ? '有批注的书' : '全部书籍'} <b>{filtered.length}</b>
          </span>
          {view === 'all' && (
            <span className="local-label">
              <span className="status-dot" />
              本地书库
            </span>
          )}
        </div>
        <div className="tool-group">
          <div className="search-box">
            <Search size={16} />
            <input
              aria-label="搜索书库"
              placeholder="搜索书名、作者…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="清空搜索" onClick={() => setQuery('')}>
                <X size={13} />
              </button>
            )}
          </div>
          <label className="sort-select" title="排序">
            <ArrowDownUp size={15} />
            <select aria-label="书库排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="added">最近添加</option>
              <option value="opened">最近阅读</option>
              <option value="title">书名 A–Z</option>
            </select>
          </label>
          <div className="view-toggle">
            <IconButton
              label="网格视图"
              active={layout === 'grid'}
              onClick={() => setLayout('grid')}
            >
              <Grid2X2 size={16} />
            </IconButton>
            <IconButton
              label="列表视图"
              active={layout === 'list'}
              onClick={() => setLayout('list')}
            >
              <List size={18} />
            </IconButton>
          </div>
        </div>
      </div>
      <div className={layout === 'grid' ? 'book-grid' : 'book-list'}>
        {filtered.map((b) => (
          <article className="book-card" key={b.id}>
            <button
              className="book-cover-button"
              onClick={() => onOpen(b)}
              aria-label={`阅读 ${b.title}`}
            >
              <div className="book-cover">
                <img src={b.cover} alt={`${b.title} 封面`} loading="lazy" />
                <span className="book-spine" />
                <span className="cover-open">
                  <BookOpen size={18} />
                  开始阅读
                </span>
                {b.sample && <span className="sample-badge">示例</span>}
              </div>
            </button>
            <div className="book-info">
              <button className="book-title" onClick={() => onOpen(b)}>
                {b.title}
              </button>
              <span className="book-author">{b.author}</span>
              <div className="book-meta">
                <span>{b.pages} 页</span>
                <span>{b.category}</span>
                {noteCounts[b.id] > 0 && (
                  <span className="mark-count">
                    <Highlighter size={11} />
                    {noteCounts[b.id]}
                  </span>
                )}
              </div>
              {b.openedAt > 0 && (
                <div className="book-progress">
                  <i style={{ width: `${(b.page / b.pages) * 100}%` }} />
                </div>
              )}
            </div>
            <div className="book-actions">
              <IconButton
                label={b.favorite ? '取消收藏' : '收藏'}
                active={b.favorite}
                onClick={() => onUpdate({ ...b, favorite: !b.favorite })}
              >
                <Heart size={15} fill={b.favorite ? 'currentColor' : 'none'} />
              </IconButton>
              <div className="menu-wrapper">
                <IconButton
                  label={`管理 ${b.title}`}
                  onClick={() => setMenu(menu === b.id ? null : b.id)}
                >
                  <MoreHorizontal size={18} />
                </IconButton>
                {menu === b.id && (
                  <div className="dropdown" onClick={(e) => e.stopPropagation()}>
                    <span className="dropdown-label">移动到分类</span>
                    {['设计与灵感', '技术与思考', '生活与阅读', '未分类'].map((c) => (
                      <button
                        key={c}
                        className={b.category === c ? 'selected' : ''}
                        onClick={() => {
                          onUpdate({ ...b, category: c });
                          setMenu(null);
                        }}
                      >
                        {c}
                      </button>
                    ))}
                    <button
                      className="danger"
                      onClick={() => {
                        onDelete(b);
                        setMenu(null);
                      }}
                    >
                      <Trash2 size={14} />
                      从书库移除
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty-state">
          <BookOpen size={36} />
          <h3>
            {query
              ? '没有找到这本书'
              : view === 'favorites'
                ? '把喜欢的书留在这里'
                : view === 'notes'
                  ? '让想法留在页边'
                  : '书架正在等待你的第一本书'}
          </h3>
          <p>
            {query
              ? '试试其他书名或作者。'
              : view === 'notes'
                ? '阅读时选中文字，添加高光、划线或笔记。'
                : '导入 PDF，开始一段新的阅读。'}
          </p>
          {view === 'all' && !query && (
            <button className="primary" onClick={onImport}>
              <Plus size={16} />
              导入 PDF
            </button>
          )}
        </div>
      )}
      <footer className="library-footer">
        <span>{books.length} 本藏书 · 文件与笔记保存在本机</span>
        <span>Made for a quieter mind.</span>
      </footer>
    </div>
  );
}

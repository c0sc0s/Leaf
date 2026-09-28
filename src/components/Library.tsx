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
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
export type LibraryView =
  'all' | 'recent' | 'favorites' | 'notes' | '设计与灵感' | '技术与思考' | '生活与阅读';
const viewNames: Record<LibraryView, string> = {
  all: '我的书架',
  recent: '最近阅读',
  favorites: '收藏',
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
    <div className="library">
      <header className="library-heading">
        <div>
          <h1>{viewNames[view]}</h1>
          <p>{view === 'notes' ? '查看和管理你的阅读批注' : `${filtered.length} 本书籍`}</p>
        </div>
        <button className="primary" onClick={onImport}>
          <Plus size={17} />
          导入 PDF
        </button>
      </header>
      {view === 'all' && recent && (
        <button className="continue-reading" onClick={() => onOpen(recent)}>
          <img src={recent.cover} alt="" />
          <div>
            <span className="eyebrow">继续阅读</span>
            <strong>{recent.title}</strong>
            <span className="muted">
              第 {recent.page} / {recent.pages} 页
            </span>
          </div>
          <ArrowUpRight size={22} />
        </button>
      )}
      <div className="library-tools">
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
                <span className="cover-open">
                  <BookOpen size={18} />
                  开始阅读
                </span>
              </div>
            </button>
            <div className="book-info">
              <button className="book-title" onClick={() => onOpen(b)}>
                {b.title}
              </button>
              <span className="book-author">{b.author}</span>
              <div className="book-meta">
                <span>{b.pages} 页</span>
                <span>{b.sample ? '示例文档' : b.category}</span>
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
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="icon-button" aria-label={`管理 ${b.title}`}>
                    <MoreHorizontal size={18} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="dropdown" align="end" sideOffset={6}>
                    <DropdownMenu.Label className="dropdown-label">移动到分类</DropdownMenu.Label>
                    <DropdownMenu.RadioGroup
                      value={b.category}
                      onValueChange={(category) => onUpdate({ ...b, category })}
                    >
                      {['设计与灵感', '技术与思考', '生活与阅读', '未分类'].map((c) => (
                        <DropdownMenu.RadioItem className="dropdown-item" key={c} value={c}>
                          {c}
                          <DropdownMenu.ItemIndicator className="menu-check">
                            ✓
                          </DropdownMenu.ItemIndicator>
                        </DropdownMenu.RadioItem>
                      ))}
                    </DropdownMenu.RadioGroup>
                    <DropdownMenu.Separator className="dropdown-separator" />
                    <DropdownMenu.Item
                      className="dropdown-item danger"
                      onSelect={() => onDelete(b)}
                    >
                      <Trash2 size={14} />
                      从书库移除
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
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
                ? '暂无收藏'
                : view === 'notes'
                  ? '暂无批注'
                  : '书库为空'}
          </h3>
          <p>
            {query
              ? '试试其他书名或作者。'
              : view === 'notes'
                ? '阅读时选中文字，添加高光、划线或笔记。'
                : '导入 PDF，或将文件拖到窗口中。'}
          </p>
          {view === 'all' && !query && (
            <button className="primary" onClick={onImport}>
              <Plus size={16} />
              导入 PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}

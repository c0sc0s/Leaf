import { EmptyState, type EmptyScene } from '@/components/Mascot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Search, Plus, ArrowUpRight, Grid2X2, List, X } from '@/components/icons';
import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Book } from '../../types';
import { Tip } from '../../components/UI';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BookCard, ReadingProgress } from './BookCard';
export type LibraryView = 'all' | 'recent' | 'favorites' | 'notes';
const viewNames: Record<LibraryView, string> = {
  all: '我的书架',
  recent: '最近阅读',
  favorites: '收藏',
  notes: '阅读笔记',
};
export function Library({
  books,
  view,
  noteCounts,
  onImport,
  onOpen,
  onUpdate,
  onDelete,
  onBrowse,
}: {
  books: Book[];
  view: LibraryView;
  noteCounts: Record<string, number>;
  onImport: () => void;
  onOpen: (b: Book) => void;
  onUpdate: (b: Book) => void;
  onDelete: (b: Book) => void;
  onBrowse: () => void;
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
              (view === 'notes' && noteCounts[b.id] > 0)) &&
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
  const emptyScene: EmptyScene = query.trim()
    ? 'search'
    : view === 'all'
      ? 'library'
      : view === 'favorites'
        ? 'favorites'
        : view === 'notes'
          ? 'notes'
          : 'recent';
  const emptyAction =
    emptyScene === 'search'
      ? { label: '清空搜索', onClick: () => setQuery('') }
      : emptyScene === 'library'
        ? { label: '导入 PDF', onClick: onImport }
        : emptyScene === 'recent' || emptyScene === 'favorites'
          ? { label: '浏览书架', onClick: onBrowse }
          : undefined;
  return (
    <div className="library">
      <header className="library-heading">
        <div>
          <h1>{viewNames[view]}</h1>
          <p>{view === 'notes' ? '查看和管理你的阅读批注' : `${filtered.length} 本书籍`}</p>
        </div>
        <Button variant="default" onClick={onImport}>
          <Plus size={17} />
          导入 PDF
        </Button>
      </header>
      {view === 'all' && recent && (
        <Button variant="ghost" className="continue-reading" onClick={() => onOpen(recent)}>
          <img src={recent.cover} alt="" />
          <div className="continue-reading-text">
            <span className="eyebrow">继续阅读</span>
            <strong>{recent.title}</strong>
            <div className="continue-reading-progress">
              <span>
                第 {recent.page} / {recent.pages} 页
              </span>
              <ReadingProgress book={recent} />
            </div>
          </div>
          <span className="continue-reading-go">
            <ArrowUpRight size={16} />
          </span>
        </Button>
      )}
      <div className="library-tools">
        <div className="tool-group">
          <div className="search-box">
            <Search size={16} />
            <Input
              aria-label="搜索书库"
              placeholder="搜索书名、作者…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <Button variant="ghost" aria-label="清空搜索" onClick={() => setQuery('')}>
                <X size={13} />
              </Button>
            )}
          </div>
          <label className="sort-select" title="排序">
            <NativeSelect
              aria-label="书库排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <NativeSelectOption value="added">最近添加</NativeSelectOption>
              <NativeSelectOption value="opened">最近阅读</NativeSelectOption>
              <NativeSelectOption value="title">书名 A–Z</NativeSelectOption>
            </NativeSelect>
          </label>
          <ToggleGroup
            type="single"
            size="sm"
            className="view-toggle"
            value={layout}
            onValueChange={(value) => {
              if (value) setLayout(value as 'grid' | 'list');
            }}
            aria-label="书库视图"
          >
            <Tip label="网格视图">
              <ToggleGroupItem value="grid" aria-label="网格视图">
                <Grid2X2 size={16} />
              </ToggleGroupItem>
            </Tip>
            <Tip label="列表视图">
              <ToggleGroupItem value="list" aria-label="列表视图">
                <List size={18} />
              </ToggleGroupItem>
            </Tip>
          </ToggleGroup>
        </div>
      </div>
      <div className={layout === 'grid' ? 'book-grid' : 'book-list'} key={`${view}:${layout}`}>
        <AnimatePresence mode="popLayout" initial>
          {filtered.map((b, index) => (
            <BookCard
              key={b.id}
              book={b}
              index={index}
              noteCount={noteCounts[b.id] || 0}
              onOpen={onOpen}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </AnimatePresence>
      </div>
      {!filtered.length && <EmptyState scene={emptyScene} action={emptyAction} />}
    </div>
  );
}

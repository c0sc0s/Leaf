import { EmptyState, type EmptyScene } from '@/components/Mascot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Search, Grid2X2, List, X } from '@/components/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { BookMetadata } from '../../types';
import { Tip } from '../../components/UI';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BookCard } from './BookCard';
import { ContinueReading } from './ContinueReading';
import { ImportMenu } from './ImportMenu';
import { ReadingAtmosphere } from './ReadingAtmosphere';
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
  onImportFolder,
  onOpen,
  onPrefetch,
  onUpdate,
  onDelete,
  onBrowse,
}: {
  books: BookMetadata[];
  view: LibraryView;
  noteCounts: Record<string, number>;
  onImport: () => void;
  onImportFolder: () => void;
  onOpen: (b: BookMetadata) => void;
  onPrefetch: (id: string) => void;
  onUpdate: (b: BookMetadata) => void;
  onDelete: (b: BookMetadata) => void;
  onBrowse: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('added');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
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
  const reading = view === 'all' ? recent : undefined;
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
        ? { label: '导入文件', onClick: onImport }
        : emptyScene === 'recent' || emptyScene === 'favorites'
          ? { label: '浏览书架', onClick: onBrowse }
          : undefined;
  return (
    <>
      {reading && <ReadingAtmosphere book={reading} />}
      <div className="library-scroll">
        <div className="library">
          {reading && <ContinueReading book={reading} onOpen={onOpen} onPrefetch={onPrefetch} />}
          <section>
            <header className="section-heading">
              <h2>{viewNames[view]}</h2>
              <p>{view === 'notes' ? '查看和管理你的阅读批注' : `${filtered.length} 本书籍`}</p>
              <ImportMenu onImport={onImport} onImportFolder={onImportFolder} />
            </header>
            <div className="library-tools">
              <div className="search-box">
                <Search size={15} />
                <Input
                  ref={searchInput}
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
            <div
              className={layout === 'grid' ? 'book-grid' : 'book-list'}
              key={`${view}:${layout}`}
            >
              <AnimatePresence mode="popLayout" initial>
                {filtered.map((b, index) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    index={index}
                    noteCount={noteCounts[b.id] || 0}
                    onOpen={onOpen}
                    onPrefetch={onPrefetch}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
            {!filtered.length && <EmptyState scene={emptyScene} action={emptyAction} />}
          </section>
        </div>
      </div>
    </>
  );
}

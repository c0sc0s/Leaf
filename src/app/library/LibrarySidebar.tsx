import { Badge } from '@leaf/ui/primitives/badge';
import { Button } from '@leaf/ui/primitives/button';
import { BookOpen, Clock3, Heart, Moon, NotebookPen, Settings2, Sun } from '@leaf/ui/icons';
import type { DocumentMetadata } from '@leaf/contracts/documents';
import { IconButton } from '@leaf/ui/primitives/composition';
import { AppBrand } from '../components/AppBrand';
import type { LibraryView } from './Library';

const views = [
  ['all', '我的书架', BookOpen],
  ['recent', '最近阅读', Clock3],
  ['favorites', '收藏', Heart],
  ['notes', '阅读笔记', NotebookPen],
] as const;

function countFor(
  view: LibraryView,
  books: DocumentMetadata[],
  noteCounts: Record<string, number>,
) {
  switch (view) {
    case 'all':
      return books.length;
    case 'recent':
      return books.filter((book) => book.openedAt > 0).length;
    case 'favorites':
      return books.filter((book) => book.favorite).length;
    case 'notes':
      return Object.values(noteCounts).reduce((total, count) => total + count, 0);
  }
}

export function LibrarySidebar({
  view,
  books,
  noteCounts,
  dark,
  onView,
  onToggleTheme,
  onSettings,
  onAbout,
}: {
  view: LibraryView;
  books: DocumentMetadata[];
  noteCounts: Record<string, number>;
  dark: boolean;
  onView: (view: LibraryView) => void;
  onToggleTheme: () => void;
  onSettings: () => void;
  onAbout: () => void;
}) {
  return (
    <aside className="library-sidebar">
      <AppBrand onClick={() => onView('all')} />
      <div className="sidebar-section-label">书库</div>
      <div className="sidebar-navigation" role="navigation" aria-label="书库导航">
        {views.map(([value, label, Icon]) => (
          <Button
            variant="ghost"
            className={view === value ? 'selected' : ''}
            aria-current={view === value ? 'page' : undefined}
            key={value}
            onClick={() => onView(value)}
          >
            <Icon size={17} />
            <span>{label}</span>
            <Badge variant="secondary" className="ml-auto text-[11px]">
              {countFor(value, books, noteCounts)}
            </Badge>
          </Button>
        ))}
      </div>
      <div className="sidebar-footer">
        <Button variant="ghost" className="about-link" onClick={onAbout}>
          关于 Leaf
        </Button>
        <IconButton label={dark ? '切换浅色模式' : '切换深色模式'} onClick={onToggleTheme}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
        <IconButton label="设置" onClick={onSettings}>
          <Settings2 size={16} />
        </IconButton>
      </div>
    </aside>
  );
}

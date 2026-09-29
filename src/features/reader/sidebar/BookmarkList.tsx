import { EmptyState } from '@/components/Mascot';
import { Button } from '@/components/ui/button';
import { memo } from 'react';
import { ArrowUpRight, Bookmark } from '@/components/icons';

export const BookmarkList = memo(function BookmarkList({
  bookmarks,
  onSelect,
  labels,
}: {
  bookmarks: number[];
  onSelect: (page: number) => void;
  labels?: Record<number, string>;
}) {
  return (
    <div className="sidebar-scroll">
      <h4>
        我的书签 <span>{bookmarks.length}</span>
      </h4>
      {bookmarks.map((n) => (
        <Button variant="ghost" className="outline-item" key={n} onClick={() => onSelect(n)}>
          <Bookmark size={13} />
          <span className="outline-title">{labels?.[n] || `第 ${n} 页`}</span>
          <span className="outline-page">
            <ArrowUpRight size={12} />
          </span>
        </Button>
      ))}
      {!bookmarks.length && <EmptyState scene="bookmarks" compact />}
    </div>
  );
});

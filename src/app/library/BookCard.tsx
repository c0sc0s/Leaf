import { Button } from '@leaf/ui/primitives/button';
import { BookOpen, Heart, Highlighter, MoreHorizontal, Trash2 } from '@leaf/ui/icons';
import type { ReactNode, Ref } from 'react';
import { m, useIsPresent } from 'motion/react';
import * as Menu from '@leaf/ui/primitives/dropdown-menu';
import type { DocumentMetadata } from '@leaf/contracts/documents';
import { rise, staggered } from '@leaf/ui/motion';
import { IconButton } from '@leaf/ui/primitives/composition';
export function BookCard({
  ref,
  book: b,
  index,
  noteCount,
  onOpen,
  onUpdate,
  onDelete,
}: {
  ref?: Ref<HTMLElement>;
  book: DocumentMetadata;
  index: number;
  noteCount: number;
  onOpen: (b: DocumentMetadata) => void;
  onUpdate: (b: DocumentMetadata) => void;
  onDelete: (b: DocumentMetadata) => void;
}) {
  return (
    <m.article
      ref={ref}
      className="book-card"
      inert={!useIsPresent()}
      layout="position"
      {...rise}
      transition={staggered(index)}
    >
      <Button
        variant="ghost"
        className="book-cover-button"
        onClick={() => onOpen(b)}
        aria-label={`阅读 ${b.title}`}
      >
        <BookCover book={b} alt={`${b.title} 封面`}>
          <span className="cover-open">
            <BookOpen size={18} />
            开始阅读
          </span>
        </BookCover>
      </Button>
      <div className="book-info">
        <Button variant="ghost" className="book-title" onClick={() => onOpen(b)}>
          {b.title}
        </Button>
        <span className="book-author">{b.author}</span>
        <div className="book-meta">
          <span>
            {b.formatId.toUpperCase()} · {b.progress.total ?? ''}
          </span>
          {b.sample && <span>示例文档</span>}
          {noteCount > 0 && (
            <span className="mark-count">
              <Highlighter size={11} />
              {noteCount}
            </span>
          )}
        </div>
        {b.openedAt > 0 && <ReadingProgress book={b} />}
      </div>
      <div className="book-actions">
        <IconButton
          label={b.favorite ? '取消收藏' : '收藏'}
          active={b.favorite}
          onClick={() => onUpdate({ ...b, favorite: !b.favorite })}
        >
          <Heart size={15} fill={b.favorite ? 'currentColor' : 'none'} />
        </IconButton>
        <Menu.DropdownMenu>
          <Menu.DropdownMenuTrigger asChild>
            <Button variant="ghost" className="icon-button" aria-label={`管理 ${b.title}`}>
              <MoreHorizontal size={18} />
            </Button>
          </Menu.DropdownMenuTrigger>

          <Menu.DropdownMenuContent align="end" sideOffset={6}>
            <Menu.DropdownMenuItem variant="destructive" onSelect={() => onDelete(b)}>
              <Trash2 size={14} />
              从书库移除
            </Menu.DropdownMenuItem>
          </Menu.DropdownMenuContent>
        </Menu.DropdownMenu>
      </div>
    </m.article>
  );
}
export function BookCover({
  book,
  alt,
  children,
}: {
  book: DocumentMetadata;
  alt: string;
  children?: ReactNode;
}) {
  return (
    <div className="book-cover">
      <span className={book.cover ? 'book-face' : 'book-face blank'}>
        {book.cover && <img src={book.cover} alt={alt} loading="lazy" />}
      </span>
      {children}
    </div>
  );
}
export function ReadingProgress({ book }: { book: DocumentMetadata }) {
  return (
    <div className="book-progress">
      <i style={{ width: `${book.progress.fraction * 100}%` }} />
    </div>
  );
}

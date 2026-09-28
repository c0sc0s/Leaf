import { Button } from '@/components/ui/button';
import { BookOpen, Heart, Highlighter, MoreHorizontal, Trash2 } from '@/components/icons';
import type { Ref } from 'react';
import { m, useIsPresent } from 'motion/react';
import * as Menu from '@/components/ui/dropdown-menu';
import type { BookMetadata } from '../../types';
import { rise, staggered } from '../../lib/motion';
import { IconButton } from '../../components/UI';
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
  book: BookMetadata;
  index: number;
  noteCount: number;
  onOpen: (b: BookMetadata) => void;
  onUpdate: (b: BookMetadata) => void;
  onDelete: (b: BookMetadata) => void;
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
        <div className="book-cover">
          <img src={b.cover} alt={`${b.title} 封面`} loading="lazy" />
          <span className="cover-open">
            <BookOpen size={18} />
            开始阅读
          </span>
        </div>
      </Button>
      <div className="book-info">
        <Button variant="ghost" className="book-title" onClick={() => onOpen(b)}>
          {b.title}
        </Button>
        <span className="book-author">{b.author}</span>
        <div className="book-meta">
          <span>
            {b.pages} {b.format === 'markdown' ? '章 · Markdown' : '页'}
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
export function ReadingProgress({ book }: { book: BookMetadata }) {
  return (
    <div className="book-progress">
      <i style={{ width: `${(book.page / book.pages) * 100}%` }} />
    </div>
  );
}

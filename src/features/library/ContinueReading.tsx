import { Button } from '@/components/ui/button';
import { ChevronRight } from '@/components/icons';
import type { BookMetadata } from '../../types';
import { BookCover, ReadingProgress } from './BookCard';

export function ContinueReading({
  book,
  onOpen,
  onPrefetch,
}: {
  book: BookMetadata;
  onOpen: (b: BookMetadata) => void;
  onPrefetch: (id: string) => void;
}) {
  return (
    <section
      className="continue-reading"
      onPointerEnter={() => onPrefetch(book.id)}
      onFocus={() => onPrefetch(book.id)}
    >
      <Button
        variant="ghost"
        className="continue-reading-cover"
        tabIndex={-1}
        aria-hidden
        onClick={() => onOpen(book)}
      >
        <BookCover book={book} alt="" />
      </Button>
      <div className="continue-reading-text">
        <strong>{book.title}</strong>
        {book.author && <span className="continue-reading-author">{book.author}</span>}
        <div className="continue-reading-progress">
          <ReadingProgress book={book} />
          <span>
            第 {book.page} / {book.pages} {book.format === 'markdown' ? '章' : '页'}
          </span>
        </div>
        <Button
          variant="glass-strong"
          className="continue-reading-action"
          onClick={() => onOpen(book)}
        >
          继续阅读
          <ChevronRight size={15} />
        </Button>
      </div>
    </section>
  );
}

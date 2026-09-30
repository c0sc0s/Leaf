import { Button } from '@leaf/ui/primitives/button';
import { ChevronRight } from '@leaf/ui/icons';
import type { DocumentMetadata } from '@leaf/contracts/documents';
import { BookCover, ReadingProgress } from './BookCard';

export function ContinueReading({
  book,
  onOpen,
}: {
  book: DocumentMetadata;
  onOpen: (b: DocumentMetadata) => void;
}) {
  return (
    <section className="continue-reading">
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
          <span>{book.progress.label}</span>
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

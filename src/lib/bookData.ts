import type { Book, BookContent, BookMetadata } from '../types';

// The shelf and progress updates never retain a document's bytes or chapters.
export function bookMetadata(book: BookMetadata | Book): BookMetadata {
  const {
    blob: _blob,
    chapters: _chapters,
    assets: _assets,
    category: _category,
    ...metadata
  } = book as Book & { category?: string };
  return metadata;
}

export function bookContent(book: Book): BookContent {
  return {
    id: book.id,
    blob: book.blob,
    ...(book.chapters ? { chapters: book.chapters } : {}),
    ...(book.assets ? { assets: book.assets } : {}),
  };
}

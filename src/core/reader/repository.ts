import type { Bookmark, ViewPosition } from '@leaf/contracts/reader';

export interface ReaderRepository {
  position(documentId: string): Promise<ViewPosition | null>;
  savePosition(documentId: string, position: ViewPosition): Promise<void>;
  bookmarks(documentId: string): Promise<Bookmark[]>;
  putBookmark(bookmark: Bookmark): Promise<void>;
  deleteBookmark(id: string): Promise<void>;
}

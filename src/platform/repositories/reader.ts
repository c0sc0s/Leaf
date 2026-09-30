import type { Bookmark, ViewPosition } from '@leaf/contracts/reader';
import type { ReaderRepository } from '../../core/reader/repository.ts';
import type { StorageClient } from '../transport/storage.ts';
import type { PersistenceCoordinator } from '../transport/persistence.ts';

export class ReaderClient implements ReaderRepository {
  constructor(
    private storage: StorageClient,
    private persistence: PersistenceCoordinator,
  ) {}
  position(documentId: string) {
    return this.storage.request('reader.position', documentId);
  }
  savePosition(documentId: string, position: ViewPosition) {
    return this.persistence.track(
      this.storage.request('reader.savePosition', { documentId, position }),
      `position:${documentId}`,
    );
  }
  bookmarks(documentId: string) {
    return this.storage.request('reader.bookmarks', documentId);
  }
  putBookmark(bookmark: Bookmark) {
    return this.persistence.track(
      this.storage.request('reader.putBookmark', bookmark),
      `bookmark:${bookmark.id}`,
    );
  }
  deleteBookmark(id: string) {
    return this.persistence.track(
      this.storage.request('reader.deleteBookmark', id),
      `bookmark:${id}`,
    );
  }
}

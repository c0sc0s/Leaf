import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Book, BookContent, BookMetadata, Annotation } from '../types';
import { bookContent, bookMetadata } from './bookData';

interface LibrarySchema extends DBSchema {
  books: { key: string; value: BookMetadata };
  bookContents: { key: string; value: BookContent };
  annotations: { key: string; value: Annotation; indexes: { bookId: string } };
  ocr: { key: string; value: { id: string; [key: string]: unknown } };
}

const database = openDB<LibrarySchema>('folio-library', 5, {
  upgrade(db, previous, _next, transaction) {
    const legacy = db as IDBPDatabase;
    if (!db.objectStoreNames.contains('ocr')) db.createObjectStore('ocr', { keyPath: 'id' });
    if (legacy.objectStoreNames.contains('documents')) legacy.deleteObjectStore('documents');
    if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('annotations')) {
      const marks = db.createObjectStore('annotations', { keyPath: 'id' });
      marks.createIndex('bookId', 'bookId');
    }
    if (!db.objectStoreNames.contains('bookContents'))
      db.createObjectStore('bookContents', { keyPath: 'id' });
    if (previous < 5) {
      // Moving bytes and metadata uses the same upgrade transaction. A failure
      // aborts the entire migration, leaving the old library intact.
      void (async () => {
        let cursor = await transaction.objectStore('books').openCursor();
        while (cursor) {
          const book = cursor.value as Book;
          await transaction.objectStore('bookContents').put(bookContent(book));
          await cursor.update(bookMetadata(book));
          cursor = await cursor.continue();
        }
      })().catch(() => {
        // A failed request may already have aborted the upgrade transaction.
        try {
          transaction.abort();
        } catch {
          /* Already aborted. */
        }
      });
    }
  },
  blocking() {
    void database.then((db) => db.close());
  },
});
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    void database.then((db) => db.close());
  });

export const storage = {
  books: async (): Promise<BookMetadata[]> => (await database).getAll('books'),
  metadata: async (id: string) => (await database).get('books', id),
  book: async (id: string): Promise<Book | null> => {
    const tx = (await database).transaction(['books', 'bookContents']);
    const [metadata, content] = await Promise.all([
      tx.objectStore('books').get(id),
      tx.objectStore('bookContents').get(id),
    ]);
    if (!metadata) return null;
    if (!content) throw new Error('书籍正文缺失，请重新导入');
    return { ...metadata, ...content };
  },
  putBook: async (book: Book) => {
    const tx = (await database).transaction(['books', 'bookContents'], 'readwrite');
    await Promise.all([
      tx.objectStore('books').put(bookMetadata(book)),
      tx.objectStore('bookContents').put(bookContent(book)),
    ]);
    await tx.done;
  },
  updateBook: async (book: BookMetadata) => {
    const tx = (await database).transaction('books', 'readwrite');
    if (await tx.store.getKey(book.id)) await tx.store.put(bookMetadata(book));
    await tx.done;
  },
  deleteBook: async (id: string) => {
    const db = await database;
    const tx = db.transaction(['books', 'bookContents', 'annotations', 'ocr'], 'readwrite');
    await tx.objectStore('books').delete(id);
    await tx.objectStore('bookContents').delete(id);
    const keys = await tx.objectStore('annotations').index('bookId').getAllKeys(id);
    for (const key of keys) await tx.objectStore('annotations').delete(key);
    const ocrKeys = await tx.objectStore('ocr').getAllKeys();
    for (const key of ocrKeys)
      if (String(key).startsWith(id + ':')) await tx.objectStore('ocr').delete(key);
    await tx.done;
    localStorage.removeItem(`folio-position:${id}`);
  },
  annotations: async (id?: string): Promise<Annotation[]> =>
    id
      ? (await database).getAllFromIndex('annotations', 'bookId', id)
      : (await database).getAll('annotations'),
  annotationCounts: async (): Promise<Record<string, number>> => {
    const index = (await database).transaction('annotations').store.index('bookId');
    const counts: Record<string, number> = {};
    // The library only needs counts, so avoid cloning every note and rectangle.
    let cursor = await index.openKeyCursor(undefined, 'nextunique');
    while (cursor) {
      counts[cursor.key] = await index.count(cursor.key);
      cursor = await cursor.continue();
    }
    return counts;
  },
  putAnnotation: async (mark: Annotation) => (await database).put('annotations', mark),
  putAnnotations: async (marks: Annotation[]) => {
    const tx = (await database).transaction('annotations', 'readwrite');
    for (const mark of marks) await tx.store.put(mark);
    await tx.done;
  },
  replaceAnnotations: async (remove: string[], restore: Annotation[]) => {
    const tx = (await database).transaction('annotations', 'readwrite');
    for (const id of remove) await tx.store.delete(id);
    for (const mark of restore) await tx.store.put(mark);
    await tx.done;
  },
  deleteAnnotation: async (id: string) => (await database).delete('annotations', id),
};
export async function fingerprint(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

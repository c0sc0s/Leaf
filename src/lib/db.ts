import { openDB } from 'idb';
import type { Book, Annotation, PageContent } from '../types';
const database = openDB('folio-library', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('ocr')) db.createObjectStore('ocr', { keyPath: 'id' });
    if (db.objectStoreNames.contains('books')) return;
    db.createObjectStore('books', { keyPath: 'id' });
    const marks = db.createObjectStore('annotations', { keyPath: 'id' });
    marks.createIndex('bookId', 'bookId');
  },
});
export const storage = {
  books: async (): Promise<Book[]> => (await database).getAll('books'),
  putBook: async (book: Book) => (await database).put('books', book),
  deleteBook: async (id: string) => {
    const db = await database;
    const tx = db.transaction(['books', 'annotations', 'ocr'], 'readwrite');
    await tx.objectStore('books').delete(id);
    const keys = await tx.objectStore('annotations').index('bookId').getAllKeys(id);
    for (const key of keys) await tx.objectStore('annotations').delete(key);
    const ocrKeys = await tx.objectStore('ocr').getAllKeys();
    for (const key of ocrKeys)
      if (String(key).startsWith(id + ':')) await tx.objectStore('ocr').delete(key);
    await tx.done;
  },
  ocr: async (bookId: string, page: number): Promise<PageContent | undefined> => {
    const saved = await (await database).get('ocr', bookId + ':' + page);
    return saved?.content;
  },
  putOCR: async (bookId: string, content: PageContent) =>
    (await database).put('ocr', { id: bookId + ':' + content.page, content }),
  annotations: async (id?: string): Promise<Annotation[]> =>
    id
      ? (await database).getAllFromIndex('annotations', 'bookId', id)
      : (await database).getAll('annotations'),
  putAnnotation: async (mark: Annotation) => (await database).put('annotations', mark),
  deleteAnnotation: async (id: string) => (await database).delete('annotations', id),
};
export async function fingerprint(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

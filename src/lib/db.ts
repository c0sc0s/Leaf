import { openDB } from 'idb';
import type { Book, Annotation, DocumentContent } from '../types';
const database = openDB('folio-library', 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('ocr')) db.createObjectStore('ocr', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('documents'))
      db.createObjectStore('documents', { keyPath: 'id' });
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
    const tx = db.transaction(['books', 'annotations', 'ocr', 'documents'], 'readwrite');
    await tx.objectStore('books').delete(id);
    await tx.objectStore('documents').delete(id);
    const keys = await tx.objectStore('annotations').index('bookId').getAllKeys(id);
    for (const key of keys) await tx.objectStore('annotations').delete(key);
    const ocrKeys = await tx.objectStore('ocr').getAllKeys();
    for (const key of ocrKeys)
      if (String(key).startsWith(id + ':')) await tx.objectStore('ocr').delete(key);
    await tx.done;
  },
  document: async (id: string): Promise<DocumentContent | undefined> =>
    (await (await database).get('documents', id))?.content,
  putDocument: async (id: string, content: DocumentContent) =>
    (await database).put('documents', { id, content }),
  annotations: async (id?: string): Promise<Annotation[]> =>
    id
      ? (await database).getAllFromIndex('annotations', 'bookId', id)
      : (await database).getAll('annotations'),
  putAnnotation: async (mark: Annotation) => (await database).put('annotations', mark),
  putAnnotations: async (marks: Annotation[]) => {
    const tx = (await database).transaction('annotations', 'readwrite');
    for (const mark of marks) await tx.store.put(mark);
    await tx.done;
  },
  deleteAnnotation: async (id: string) => (await database).delete('annotations', id),
};
export async function fingerprint(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { Book, Annotation } from '../types';

type Stores = 'books' | 'files' | 'annotations' | 'ocr';
type UpgradeTransaction = IDBPTransaction<unknown, Stores[], 'versionchange'>;

/** A stored PDF lives apart from its book record so metadata writes never rewrite the file. */
interface StoredFile {
  id: string;
  blob: Blob;
}

// Each entry upgrades from the previous version; they run in order for any older database.
const migrations: ((db: IDBPDatabase, tx: UpgradeTransaction) => Promise<void> | void)[] = [
  (db) => {
    db.createObjectStore('books', { keyPath: 'id' });
    db.createObjectStore('annotations', { keyPath: 'id' }).createIndex('bookId', 'bookId');
  },
  () => {},
  () => {},
  (db) => {
    if (!db.objectStoreNames.contains('ocr')) db.createObjectStore('ocr', { keyPath: 'id' });
    if (db.objectStoreNames.contains('documents')) db.deleteObjectStore('documents');
  },
  async (db, tx) => {
    db.createObjectStore('files', { keyPath: 'id' });
    const files = tx.objectStore('files');
    let cursor = await tx.objectStore('books').openCursor();
    while (cursor) {
      const {
        blob,
        category: _category,
        ...book
      } = cursor.value as Book & {
        blob?: Blob;
        category?: string;
      };
      if (blob) await files.put({ id: book.id, blob } satisfies StoredFile);
      await cursor.update(book);
      cursor = await cursor.continue();
    }
  },
];

const database = openDB('folio-library', migrations.length, {
  async upgrade(db, oldVersion, _newVersion, tx) {
    for (let version = oldVersion; version < migrations.length; version++)
      await migrations[version](db, tx as unknown as UpgradeTransaction);
  },
});

export const storage = {
  books: async (): Promise<Book[]> => (await database).getAll('books'),
  hasBook: async (id: string) => (await (await database).getKey('books', id)) !== undefined,
  /** Stores a newly imported book together with its PDF in one transaction. */
  addBook: async (book: Book, file: Blob) => {
    const tx = (await database).transaction(['books', 'files'], 'readwrite');
    await Promise.all([
      tx.objectStore('books').put(book),
      tx.objectStore('files').put({ id: book.id, blob: file } satisfies StoredFile),
      tx.done,
    ]);
  },
  /** Updates book metadata only; the PDF itself is never rewritten. */
  putBook: async (book: Book) => (await database).put('books', book),
  file: async (id: string): Promise<Blob> => {
    const stored: StoredFile | undefined = await (await database).get('files', id);
    if (!stored) throw new Error(`PDF 文件缺失（${id}）`);
    return stored.blob;
  },
  deleteBook: async (id: string) => {
    const db = await database;
    const tx = db.transaction(['books', 'files', 'annotations', 'ocr'], 'readwrite');
    await tx.objectStore('books').delete(id);
    await tx.objectStore('files').delete(id);
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

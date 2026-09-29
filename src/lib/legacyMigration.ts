import type { Annotation, Book, BookContent } from '../types';
import {
  fingerprint,
  stageBook,
  releaseUploads,
  type ContentReference,
  type StoredBook,
} from './db';
import { storageRequest } from './storageClient';

const databaseName = 'folio-library';
function request<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function oldPreferences() {
  return Object.fromEntries(
    Object.keys(localStorage)
      .filter((key) => key.startsWith('folio-'))
      .sort()
      .map((key) => [key, localStorage.getItem(key)!]),
  );
}
async function snapshot() {
  const databases = await indexedDB.databases();
  if (!databases.some((database) => database.name === databaseName))
    return {
      books: [] as Book[],
      annotations: [] as Annotation[],
      cache: [] as { id: string }[],
      preferences: oldPreferences(),
      exists: false,
    };
  const db = await request(indexedDB.open(databaseName));
  try {
    if (db.version > 5) throw new Error('旧书库版本比当前应用更新，无法迁移');
    const names = ['books', 'bookContents', 'annotations', 'ocr'].filter((name) =>
      db.objectStoreNames.contains(name),
    );
    const tx = db.transaction(names, 'readonly');
    const values = Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [name, await request(tx.objectStore(name).getAll())]),
      ),
    );
    const contents = new Map<string, BookContent>(
      (values.bookContents ?? []).map((body: BookContent) => [body.id, body]),
    );
    const books: Book[] = (values.books ?? []).map((book: Book) => {
      const combined = { ...book, ...contents.get(book.id), favorite: book.favorite ?? false };
      if (!(combined.blob instanceof Blob)) throw new Error(`旧书籍正文缺失：${book.title}`);
      return combined;
    });
    return {
      books,
      annotations: (values.annotations ?? []).map((mark: Partial<Annotation>) => ({
        start: 0,
        end: mark.quote?.length ?? 0,
        quote: '',
        kind: 'highlight',
        color: 'amber',
        note: '',
        rects: [],
        source: 'text',
        ...mark,
      })) as Annotation[],
      cache: (values.ocr ?? []) as { id: string }[],
      preferences: oldPreferences(),
      exists: true,
    };
  } finally {
    db.close();
  }
}
async function digestSnapshot(value: unknown) {
  // Hash every byte before deleting the source, including Markdown image assets.
  const serialize = async (value: unknown): Promise<unknown> => {
    if (value instanceof Blob)
      return {
        hash: await fingerprint(await value.arrayBuffer()),
        type: value.type,
        size: value.size,
      };
    if (Array.isArray(value)) {
      const result = [];
      for (const entry of value) result.push(await serialize(entry));
      return result;
    }
    if (value && typeof value === 'object')
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(async ([key, entry]) => [key, await serialize(entry)]),
        ),
      );
    return value;
  };
  return fingerprint(new TextEncoder().encode(JSON.stringify(await serialize(value))).buffer);
}
async function alreadyMigrated(value: Awaited<ReturnType<typeof snapshot>>) {
  const reference = async (blob: Blob): Promise<ContentReference> => ({
    hash: await fingerprint(await blob.arrayBuffer()),
    size: blob.size,
    type: blob.type,
  });
  for (const book of value.books) {
    const stored = await storageRequest<(StoredBook & { lease: string }) | null>('book', book.id);
    if (!stored) return false;
    try {
      const content = {
        blob: await reference(book.blob),
        chapters: book.chapters,
        assets:
          book.assets === undefined
            ? undefined
            : await Promise.all(
                book.assets.map(async (asset) => ({
                  path: asset.path,
                  blob: await reference(asset.blob),
                })),
              ),
      };
      if ((await digestSnapshot(content)) !== (await digestSnapshot(stored.content))) return false;
    } finally {
      await storageRequest('release', stored.lease);
    }
  }
  const saved = new Map(
    (await storageRequest<Annotation[]>('annotations')).map((mark) => [mark.id, mark]),
  );
  for (const mark of value.annotations) {
    if ((await digestSnapshot(mark)) !== (await digestSnapshot(saved.get(mark.id)))) return false;
  }
  return true;
}
async function migrateLegacyLibrary() {
  const initial = await snapshot();
  if (!initial.exists && !Object.keys(initial.preferences).length) return;
  const source = location.origin === 'null' ? 'file://leaf' : location.origin;
  const digest = await digestSnapshot(initial);
  const receipt = await storageRequest<string | undefined>('legacyReceipt', source);
  if (receipt && !initial.exists) {
    const saved = await storageRequest<Record<string, string>>('preferences');
    if (Object.entries(initial.preferences).every(([key, value]) => saved[key] === value)) {
      for (const key of Object.keys(initial.preferences)) localStorage.removeItem(key);
      return;
    }
  }
  if (receipt && receipt !== digest) {
    // An older app can recreate its source after migration. Keep it intact and
    // retain SQLite progress and preferences when all source content is already present.
    if (await alreadyMigrated(initial)) return '已打开现有书库。检测到旧版书库副本，旧数据已保留。';
    throw new Error('旧库在迁移后发生变化，已保留旧数据，请检查后重试');
  }
  const references: ContentReference[] = [];
  try {
    if (!receipt) {
      const books = [];
      for (const book of initial.books) books.push(await stageBook(book, references));
      if ((await digestSnapshot(await snapshot())) !== digest)
        throw new Error('旧库正在被修改，请关闭其他 Leaf 窗口后重试');
      await storageRequest('importLegacy', {
        source,
        digest,
        books,
        annotations: initial.annotations,
        preferences: initial.preferences,
        cache: initial.cache,
      });
    }
    if ((await digestSnapshot(await snapshot())) !== digest)
      throw new Error('旧库正在被修改，已停止清理');
    if (initial.exists)
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase(databaseName);
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
        deletion.onblocked = () =>
          reject(new Error('请关闭仍在使用旧书库的窗口，然后重新启动 Leaf'));
      });
    for (const key of Object.keys(initial.preferences)) localStorage.removeItem(key);
  } finally {
    await releaseUploads(references);
  }
}

export async function migrateLegacyStorage() {
  const notice = await migrateLegacyLibrary();
  const keys = ['leaf-sidebar-width', 'leaf-notes-width'];
  const remaining = keys.filter((key) => localStorage.getItem(key) !== null);
  if (!remaining.length) return notice;
  // These keys were outside the original snapshot. Keep its digest stable for pending cleanups.
  const saved = await storageRequest<Record<string, string>>('preferences');
  for (const key of remaining) {
    const value = localStorage.getItem(key)!;
    if (saved[key] === undefined) await storageRequest('setPreference', { key, value });
    localStorage.removeItem(key);
  }
  return notice;
}

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { migrateSchema } from './schema.ts';
import { createContentStore, type ContentReference } from './content.ts';
import { backupLibrary } from './backup.ts';

// Record shapes as the renderer sends them. Every operation still validates its input at
// runtime: these types describe the contract, not a guarantee from the other process.

interface ReadingLocation {
  page: number;
  ratio: number;
  [key: string]: unknown;
}

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  filename: string;
  format?: 'pdf' | 'markdown';
  pages: number;
  cover: string;
  addedAt: number;
  openedAt: number;
  page: number;
  favorite: boolean;
  bookmarks?: number[];
  bookmarkLocations?: Record<number, ReadingLocation>;
  [detail: string]: unknown;
}

interface ChapterRecord {
  path: string;
  title: string;
  content: string;
}

export interface StoredBookInput {
  metadata: BookRecord;
  content: {
    blob: ContentReference;
    chapters?: ChapterRecord[];
    assets?: { path: string; blob: ContentReference }[];
  };
}

export interface AnnotationRecord {
  id: string;
  bookId: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  kind: string;
  color: string;
  note: string;
  rects: number[][];
  createdAt: number;
  source: string;
}

export interface AskThreadRecord {
  id: string;
  bookId: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  createdAt: number;
}

export interface AskMessageRecord {
  threadId: string;
  ordinal: number;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  createdAt: number;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  filename: string;
  format: string | null;
  pages: number;
  cover: string;
  added_at: number;
  opened_at: number;
  page: number;
  favorite: number;
  details: string;
}

interface AnnotationRow {
  id: string;
  book_id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  kind: string;
  color: string;
  note: string;
  rects: string;
  created_at: number;
  source: string;
}

interface AskThreadRow {
  id: string;
  book_id: string;
  page: number;
  start: number;
  end: number;
  quote: string;
  created_at: number;
}

interface AskMessageRow {
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: number;
}

interface LegacyImport {
  source: string;
  digest: string;
  books: StoredBookInput[];
  annotations: AnnotationRecord[];
  preferences: Record<string, string>;
  cache: { id: string }[];
}

const all = <T>(statement: StatementSync, ...params: SQLInputValue[]) =>
  statement.all(...params) as unknown as T[];
const one = <T>(statement: StatementSync, ...params: SQLInputValue[]) =>
  statement.get(...params) as unknown as T | undefined;

export type Library = ReturnType<typeof openLibrary>;

export function openLibrary(root: string) {
  fs.mkdirSync(root, { recursive: true });
  const lockPath = path.join(root, '.writer-lock');
  const owner = { pid: process.pid, token: randomUUID() };
  if (fs.existsSync(lockPath)) {
    const previous = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      fs.rmSync(lockPath);
    }
  }
  const lock = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(lock, JSON.stringify(owner));
  fs.closeSync(lock);
  const unlock = () => {
    if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).token === owner.token) fs.rmSync(lockPath);
  };
  let db: DatabaseSync | undefined;
  let content: ReturnType<typeof createContentStore>;
  try {
    const database = new DatabaseSync(path.join(root, 'library.sqlite'));
    db = database;
    database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    migrateSchema(database, () => {
      const destination = path.join(root, 'backups', `schema-${Date.now()}`);
      backupLibrary(database, root, destination);
    });
    database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    content = createContentStore(root, database);
  } catch (error) {
    db?.close();
    unlock();
    throw error;
  }
  const database = db;
  let transactionDepth = 0;
  const transaction = <T>(callback: () => T): T => {
    if (transactionDepth) return callback();
    database.exec('BEGIN IMMEDIATE');
    transactionDepth++;
    try {
      const result = callback();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    } finally {
      transactionDepth--;
    }
  };
  const identifier = (value: unknown): string => {
    if (typeof value !== 'string' || !value || value.length > 4096)
      throw new Error('Invalid storage ID');
    return value;
  };
  const metadataValues = (book: BookRecord): SQLInputValue[] => {
    const {
      id,
      title,
      author,
      filename,
      format,
      pages,
      cover,
      addedAt,
      openedAt,
      page,
      favorite,
      bookmarks,
      bookmarkLocations,
      blob: _blob,
      chapters: _chapters,
      assets: _assets,
      ...details
    } = book;
    identifier(id);
    if (
      [title, author, filename, cover].some((value) => typeof value !== 'string') ||
      ![pages, page, addedAt, openedAt].every(Number.isFinite) ||
      !Number.isInteger(pages) ||
      pages < 1 ||
      !Number.isInteger(page) ||
      page < 1 ||
      (format !== undefined && !['pdf', 'markdown'].includes(format)) ||
      typeof favorite !== 'boolean'
    )
      throw new Error('Invalid book metadata');
    return [
      id,
      title,
      author,
      filename,
      format ?? null,
      pages,
      cover,
      addedAt,
      openedAt,
      page,
      favorite ? 1 : 0,
      JSON.stringify({
        ...details,
        hasBookmarks: bookmarks !== undefined,
        hasBookmarkLocations: bookmarkLocations !== undefined,
      }),
    ];
  };
  const metadata = (row: BookRow | undefined): BookRecord | undefined => {
    if (!row) return undefined;
    const { hasBookmarks, hasBookmarkLocations, ...details } = JSON.parse(row.details);
    const marks = all<{ page: number; location: string | null }>(
      database.prepare('SELECT page, location FROM bookmarks WHERE book_id=? ORDER BY page'),
      row.id,
    );
    return {
      ...details,
      id: row.id,
      title: row.title,
      author: row.author,
      filename: row.filename,
      ...(row.format === null ? {} : { format: row.format as BookRecord['format'] }),
      pages: row.pages,
      cover: row.cover,
      addedAt: row.added_at,
      openedAt: row.opened_at,
      page: row.page,
      favorite: Boolean(row.favorite),
      ...(hasBookmarks ? { bookmarks: marks.map((entry) => entry.page) } : {}),
      ...(hasBookmarkLocations
        ? {
            bookmarkLocations: Object.fromEntries(
              marks
                .filter((entry) => entry.location)
                .map((entry) => [entry.page, JSON.parse(entry.location!)]),
            ),
          }
        : {}),
    };
  };
  const writeBookmarks = (book: BookRecord) => {
    database.prepare('DELETE FROM bookmarks WHERE book_id=?').run(book.id);
    const pages = new Set([
      ...(book.bookmarks ?? []),
      ...Object.keys(book.bookmarkLocations ?? {}).map(Number),
    ]);
    for (const page of pages) {
      if (!Number.isInteger(page) || page < 1 || page > book.pages)
        throw new Error('Invalid bookmark page');
      database
        .prepare('INSERT INTO bookmarks VALUES (?, ?, ?)')
        .run(
          book.id,
          page,
          book.bookmarkLocations?.[page] ? JSON.stringify(book.bookmarkLocations[page]) : null,
        );
    }
  };
  const getMetadata = (id: unknown) =>
    metadata(one<BookRow>(database.prepare('SELECT * FROM books WHERE id=?'), identifier(id)));
  const putBook = ({ metadata: book, content: body }: StoredBookInput) => {
    const values = metadataValues(book);
    const blobs = [body.blob, ...(body.assets ?? []).map((asset) => asset.blob)];
    for (const blob of blobs) content.validateUpload(blob);
    transaction(() => {
      database
        .prepare(
          `INSERT INTO books VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author,
        filename=excluded.filename, format=excluded.format, pages=excluded.pages,
        cover=excluded.cover, added_at=excluded.added_at, opened_at=excluded.opened_at,
        page=excluded.page, favorite=excluded.favorite, details=excluded.details`,
        )
        .run(...values);
      writeBookmarks(book);
      database
        .prepare(
          `INSERT INTO book_contents VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(book_id) DO UPDATE SET hash=excluded.hash, mime=excluded.mime,
        has_chapters=excluded.has_chapters, has_assets=excluded.has_assets`,
        )
        .run(
          book.id,
          body.blob.hash,
          body.blob.type,
          body.chapters === undefined ? 0 : 1,
          body.assets === undefined ? 0 : 1,
        );
      database.prepare('DELETE FROM chapters WHERE book_id=?').run(book.id);
      database.prepare('DELETE FROM book_assets WHERE book_id=?').run(book.id);
      for (const [ordinal, chapter] of (body.chapters ?? []).entries())
        database
          .prepare('INSERT INTO chapters VALUES (?, ?, ?, ?, ?)')
          .run(book.id, ordinal, chapter.path, chapter.title, chapter.content);
      for (const [ordinal, asset] of (body.assets ?? []).entries())
        database
          .prepare('INSERT INTO book_assets VALUES (?, ?, ?, ?, ?)')
          .run(book.id, ordinal, asset.path, asset.blob.hash, asset.blob.type);
      for (const blob of blobs) content.release(blob.token!);
    });
  };
  const annotation = (row: AnnotationRow): AnnotationRecord => ({
    id: row.id,
    bookId: row.book_id,
    page: row.page,
    start: row.start,
    end: row.end,
    quote: row.quote,
    kind: row.kind,
    color: row.color,
    note: row.note,
    rects: JSON.parse(row.rects),
    createdAt: row.created_at,
    source: row.source,
  });
  const writeAnnotations = (marks: AnnotationRecord[]) => {
    if (!Array.isArray(marks)) throw new Error('Invalid annotations');
    for (const mark of marks) {
      identifier(mark.id);
      identifier(mark.bookId);
      if (
        !['highlight', 'underline'].includes(mark.kind) ||
        !['amber', 'green', 'blue', 'pink'].includes(mark.color) ||
        !['text', 'ocr'].includes(mark.source) ||
        !Array.isArray(mark.rects) ||
        ![mark.page, mark.start, mark.end].every(Number.isInteger) ||
        mark.page < 1 ||
        mark.start < 0 ||
        mark.end < mark.start ||
        !Number.isFinite(mark.createdAt)
      )
        throw new Error('Invalid annotation');
      database
        .prepare(
          `INSERT INTO annotations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET book_id=excluded.book_id, page=excluded.page,
        start=excluded.start, end=excluded.end, quote=excluded.quote, kind=excluded.kind,
        color=excluded.color, note=excluded.note, rects=excluded.rects,
        created_at=excluded.created_at, source=excluded.source`,
        )
        .run(
          mark.id,
          mark.bookId,
          mark.page,
          mark.start,
          mark.end,
          mark.quote,
          mark.kind,
          mark.color,
          mark.note,
          JSON.stringify(mark.rects),
          mark.createdAt,
          mark.source,
        );
    }
  };
  const preferences = (): Record<string, string> =>
    Object.fromEntries([
      ...all<{ key: string; value: string }>(
        database.prepare('SELECT key, value FROM preferences'),
      ).map((row) => [row.key, row.value]),
      ...all<{ book_id: string; state: string }>(
        database.prepare('SELECT * FROM reading_states'),
      ).map((row) => [`folio-position:${row.book_id}`, row.state]),
    ]);
  const preference = ({ key, value }: { key: string; value: string | null }) => {
    identifier(key);
    if (
      !key.startsWith('folio-') &&
      !['leaf-sidebar-width', 'leaf-notes-width', 'leaf-ask-width'].includes(key)
    )
      throw new Error('Invalid preference key');
    if (value !== null && typeof value !== 'string') throw new Error('Invalid preference value');
    if (key.startsWith('folio-position:')) {
      const bookId = key.slice('folio-position:'.length);
      if (value === null)
        database.prepare('DELETE FROM reading_states WHERE book_id=?').run(bookId);
      else if (getMetadata(bookId))
        database
          .prepare(
            `INSERT INTO reading_states VALUES (?, ?)
        ON CONFLICT(book_id) DO UPDATE SET state=excluded.state`,
          )
          .run(bookId, value);
    } else if (value === null) database.prepare('DELETE FROM preferences WHERE key=?').run(key);
    else
      database
        .prepare(
          'INSERT INTO preferences VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        )
        .run(key, value);
  };
  const askThreads = (bookId: string) => {
    const messages = database.prepare(
      'SELECT role, content, model, created_at FROM ask_messages WHERE thread_id=? ORDER BY ordinal',
    );
    return all<AskThreadRow>(
      database.prepare('SELECT * FROM ask_threads WHERE book_id=? ORDER BY created_at DESC, id'),
      identifier(bookId),
    ).map((row) => ({
      id: row.id,
      bookId: row.book_id,
      page: row.page,
      start: row.start,
      end: row.end,
      quote: row.quote,
      createdAt: row.created_at,
      messages: all<AskMessageRow>(messages, row.id).map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.model === null ? {} : { model: message.model }),
        createdAt: message.created_at,
      })),
    }));
  };
  const putAskThread = (thread: AskThreadRecord) => {
    identifier(thread?.id);
    identifier(thread.bookId);
    if (
      ![thread.page, thread.start, thread.end].every(Number.isInteger) ||
      thread.page < 1 ||
      thread.start < 0 ||
      thread.end < thread.start ||
      typeof thread.quote !== 'string' ||
      !Number.isFinite(thread.createdAt)
    )
      throw new Error('Invalid ask thread');
    database
      .prepare('INSERT INTO ask_threads VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
      .run(
        thread.id,
        thread.bookId,
        thread.page,
        thread.start,
        thread.end,
        thread.quote,
        thread.createdAt,
      );
  };
  const putAskMessage = (message: AskMessageRecord) => {
    identifier(message?.threadId);
    if (
      !Number.isInteger(message.ordinal) ||
      message.ordinal < 0 ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      (message.model !== undefined && typeof message.model !== 'string') ||
      !Number.isFinite(message.createdAt)
    )
      throw new Error('Invalid ask message');
    database
      .prepare('INSERT INTO ask_messages VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        message.threadId,
        message.ordinal,
        message.role,
        message.content,
        message.model ?? null,
        message.createdAt,
      );
  };
  const operations = {
    askThreads,
    putAskThread: (thread: AskThreadRecord) => transaction(() => putAskThread(thread)),
    putAskMessage: (message: AskMessageRecord) => transaction(() => putAskMessage(message)),
    deleteAskThread: (id: string) => {
      database.prepare('DELETE FROM ask_threads WHERE id=?').run(identifier(id));
    },
    legacyReceipt: (source: string) =>
      one<{ digest: string }>(
        database.prepare('SELECT digest FROM legacy_imports WHERE source=?'),
        identifier(source),
      )?.digest,
    importLegacy: ({
      source,
      digest,
      books,
      annotations,
      preferences: values,
      cache,
    }: LegacyImport) =>
      transaction(() => {
        identifier(source);
        identifier(digest);
        const receipt = one<{ digest: string }>(
          database.prepare('SELECT digest FROM legacy_imports WHERE source=?'),
          source,
        );
        if (receipt) {
          if (receipt.digest !== digest)
            throw new Error('旧库在迁移后发生变化，请保留旧库并检查数据');
          return;
        }
        for (const book of books) {
          if (getMetadata(book.metadata.id))
            throw new Error('旧书库与 SQLite 存在同名记录，迁移已停止');
          putBook(book);
        }
        for (const mark of annotations)
          if (database.prepare('SELECT 1 FROM annotations WHERE id=?').get(mark.id))
            throw new Error('旧批注 ID 冲突');
        writeAnnotations(annotations);
        for (const [key, value] of Object.entries(values)) {
          const existing = preferences();
          if (existing[key] === undefined) preference({ key, value });
        }
        for (const item of cache)
          database
            .prepare('INSERT INTO legacy_cache VALUES (?, ?)')
            .run(identifier(item.id), JSON.stringify(item));
        if (database.prepare('PRAGMA foreign_key_check').all().length)
          throw new Error('旧库迁移关联校验失败');
        database.prepare('INSERT INTO legacy_imports VALUES (?, ?)').run(source, digest);
      }),
    books: () =>
      all<BookRow>(database.prepare('SELECT * FROM books ORDER BY added_at DESC')).map(metadata),
    metadata: getMetadata,
    book: (id: string) => {
      const book = getMetadata(id);
      if (!book) return null;
      const row = one<{ hash: string; mime: string; has_chapters: number; has_assets: number }>(
        database.prepare('SELECT * FROM book_contents WHERE book_id=?'),
        id,
      );
      if (!row) throw new Error('书籍正文缺失，请重新导入');
      const assets = all<{ path: string; hash: string; mime: string }>(
        database.prepare('SELECT * FROM book_assets WHERE book_id=? ORDER BY ordinal'),
        id,
      );
      const body = {
        blob: content.reference(row.hash, row.mime),
        ...(row.has_chapters
          ? {
              chapters: all<ChapterRecord>(
                database.prepare(
                  'SELECT path, title, content FROM chapters WHERE book_id=? ORDER BY ordinal',
                ),
                id,
              ),
            }
          : {}),
        ...(row.has_assets
          ? {
              assets: assets.map((asset) => ({
                path: asset.path,
                blob: content.reference(asset.hash, asset.mime),
              })),
            }
          : {}),
      };
      return {
        metadata: book,
        content: body,
        lease: content.acquire([row.hash, ...assets.map((asset) => asset.hash)]),
      };
    },
    putBook,
    updateBook: (book: BookRecord) =>
      transaction(() => {
        const [id, ...values] = metadataValues(book);
        if (!getMetadata(id)) return;
        database
          .prepare(
            `UPDATE books SET title=?, author=?, filename=?, format=?, pages=?, cover=?,
        added_at=?, opened_at=?, page=?, favorite=?, details=? WHERE id=?`,
          )
          .run(...values, id);
        writeBookmarks(book);
      }),
    deleteBook: (id: string) => {
      transaction(() => {
        database.prepare('DELETE FROM books WHERE id=?').run(identifier(id));
        database
          .prepare('DELETE FROM legacy_cache WHERE substr(id, 1, ?) = ?')
          .run(id.length + 1, id + ':');
      });
    },
    annotations: (id?: string | null) =>
      (id === undefined || id === null
        ? all<AnnotationRow>(database.prepare('SELECT * FROM annotations ORDER BY created_at, id'))
        : all<AnnotationRow>(
            database.prepare('SELECT * FROM annotations WHERE book_id=? ORDER BY created_at, id'),
            identifier(id),
          )
      ).map(annotation),
    annotationCounts: () =>
      Object.fromEntries(
        all<{ book_id: string; count: number }>(
          database.prepare('SELECT book_id, count(*) AS count FROM annotations GROUP BY book_id'),
        ).map((row) => [row.book_id, row.count]),
      ),
    putAnnotations: (marks: AnnotationRecord[]) => transaction(() => writeAnnotations(marks)),
    replaceAnnotations: ({ remove, restore }: { remove: string[]; restore: AnnotationRecord[] }) =>
      transaction(() => {
        for (const id of remove)
          database.prepare('DELETE FROM annotations WHERE id=?').run(identifier(id));
        writeAnnotations(restore);
      }),
    deleteAnnotation: (id: string) => {
      database.prepare('DELETE FROM annotations WHERE id=?').run(identifier(id));
    },
    preferences,
    setPreference: preference,
    beginBlob: (input: { size: number; type: string }) => content.begin(input),
    appendBlob: (input: { token: string; offset: number; data: string }) => content.append(input),
    finishBlob: (token: string) => content.finish(token),
    abortBlob: (token: string) => content.abort(identifier(token)),
    readBlob: (input: { token: string; hash: string; offset: number }) => content.read(input),
    release: (token: string) => content.release(identifier(token)),
    flush: () => {},
  };
  return {
    request(operation: string, input?: unknown): unknown {
      if (!Object.hasOwn(operations, operation)) throw new Error('Unknown storage operation');
      return (operations[operation as keyof typeof operations] as (input: unknown) => unknown)(
        input,
      );
    },
    collect: content.collect,
    backup: (destination: string) => backupLibrary(database, root, destination),
    close() {
      try {
        content.close();
        database.close();
      } finally {
        unlock();
      }
    },
  };
}

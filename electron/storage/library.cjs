const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { migrateSchema } = require('./schema.cjs');
const { createContentStore } = require('./content.cjs');
const { backupLibrary } = require('./backup.cjs');

function openLibrary(root) {
  fs.mkdirSync(root, { recursive: true });
  const lockPath = path.join(root, '.writer-lock');
  const owner = { pid: process.pid, token: randomUUID() };
  if (fs.existsSync(lockPath)) {
    const previous = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
      fs.rmSync(lockPath);
    }
  }
  const lock = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(lock, JSON.stringify(owner));
  fs.closeSync(lock);
  const unlock = () => {
    if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).token === owner.token) fs.rmSync(lockPath);
  };
  let db;
  let content;
  try {
    db = new DatabaseSync(path.join(root, 'library.sqlite'));
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    migrateSchema(db, () => {
      const destination = path.join(root, 'backups', `schema-${Date.now()}`);
      backupLibrary(db, root, destination);
    });
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    content = createContentStore(root, db);
  } catch (error) {
    db?.close();
    unlock();
    throw error;
  }
  let transactionDepth = 0;
  const transaction = (callback) => {
    if (transactionDepth) return callback();
    db.exec('BEGIN IMMEDIATE');
    transactionDepth++;
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    } finally {
      transactionDepth--;
    }
  };
  const identifier = (value) => {
    if (typeof value !== 'string' || !value || value.length > 4096)
      throw new Error('Invalid storage ID');
    return value;
  };
  const metadataValues = (book) => {
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
  const metadata = (row) => {
    if (!row) return undefined;
    const { hasBookmarks, hasBookmarkLocations, ...details } = JSON.parse(row.details);
    const marks = db
      .prepare('SELECT page, location FROM bookmarks WHERE book_id=? ORDER BY page')
      .all(row.id);
    return {
      ...details,
      id: row.id,
      title: row.title,
      author: row.author,
      filename: row.filename,
      ...(row.format === null ? {} : { format: row.format }),
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
                .map((entry) => [entry.page, JSON.parse(entry.location)]),
            ),
          }
        : {}),
    };
  };
  const writeBookmarks = (book) => {
    db.prepare('DELETE FROM bookmarks WHERE book_id=?').run(book.id);
    const pages = new Set([
      ...(book.bookmarks ?? []),
      ...Object.keys(book.bookmarkLocations ?? {}).map(Number),
    ]);
    for (const page of pages) {
      if (!Number.isInteger(page) || page < 1 || page > book.pages)
        throw new Error('Invalid bookmark page');
      db.prepare('INSERT INTO bookmarks VALUES (?, ?, ?)').run(
        book.id,
        page,
        book.bookmarkLocations?.[page] ? JSON.stringify(book.bookmarkLocations[page]) : null,
      );
    }
  };
  const getMetadata = (id) =>
    metadata(db.prepare('SELECT * FROM books WHERE id=?').get(identifier(id)));
  const putBook = ({ metadata: book, content: body }) => {
    const values = metadataValues(book);
    const blobs = [body.blob, ...(body.assets ?? []).map((asset) => asset.blob)];
    for (const blob of blobs) content.validateUpload(blob);
    transaction(() => {
      db.prepare(
        `INSERT INTO books VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author,
        filename=excluded.filename, format=excluded.format, pages=excluded.pages,
        cover=excluded.cover, added_at=excluded.added_at, opened_at=excluded.opened_at,
        page=excluded.page, favorite=excluded.favorite, details=excluded.details`,
      ).run(...values);
      writeBookmarks(book);
      db.prepare(
        `INSERT INTO book_contents VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(book_id) DO UPDATE SET hash=excluded.hash, mime=excluded.mime,
        has_chapters=excluded.has_chapters, has_assets=excluded.has_assets`,
      ).run(
        book.id,
        body.blob.hash,
        body.blob.type,
        body.chapters === undefined ? 0 : 1,
        body.assets === undefined ? 0 : 1,
      );
      db.prepare('DELETE FROM chapters WHERE book_id=?').run(book.id);
      db.prepare('DELETE FROM book_assets WHERE book_id=?').run(book.id);
      for (const [ordinal, chapter] of (body.chapters ?? []).entries())
        db.prepare('INSERT INTO chapters VALUES (?, ?, ?, ?, ?)').run(
          book.id,
          ordinal,
          chapter.path,
          chapter.title,
          chapter.content,
        );
      for (const [ordinal, asset] of (body.assets ?? []).entries())
        db.prepare('INSERT INTO book_assets VALUES (?, ?, ?, ?, ?)').run(
          book.id,
          ordinal,
          asset.path,
          asset.blob.hash,
          asset.blob.type,
        );
      for (const blob of blobs) content.release(blob.token);
    });
  };
  const annotation = (row) => ({
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
  const writeAnnotations = (marks) => {
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
      db.prepare(
        `INSERT INTO annotations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET book_id=excluded.book_id, page=excluded.page,
        start=excluded.start, end=excluded.end, quote=excluded.quote, kind=excluded.kind,
        color=excluded.color, note=excluded.note, rects=excluded.rects,
        created_at=excluded.created_at, source=excluded.source`,
      ).run(
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
  const preference = ({ key, value }) => {
    identifier(key);
    if (!key.startsWith('folio-') && !['leaf-sidebar-width', 'leaf-notes-width'].includes(key))
      throw new Error('Invalid preference key');
    if (value !== null && typeof value !== 'string') throw new Error('Invalid preference value');
    if (key.startsWith('folio-position:')) {
      const bookId = key.slice('folio-position:'.length);
      if (value === null) db.prepare('DELETE FROM reading_states WHERE book_id=?').run(bookId);
      else if (getMetadata(bookId))
        db.prepare(
          `INSERT INTO reading_states VALUES (?, ?)
        ON CONFLICT(book_id) DO UPDATE SET state=excluded.state`,
        ).run(bookId, value);
    } else if (value === null) db.prepare('DELETE FROM preferences WHERE key=?').run(key);
    else
      db.prepare(
        'INSERT INTO preferences VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ).run(key, value);
  };
  const operations = {
    legacyReceipt: (source) =>
      db.prepare('SELECT digest FROM legacy_imports WHERE source=?').get(identifier(source))
        ?.digest,
    importLegacy: ({ source, digest, books, annotations, preferences, cache }) =>
      transaction(() => {
        identifier(source);
        identifier(digest);
        const receipt = db.prepare('SELECT digest FROM legacy_imports WHERE source=?').get(source);
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
          if (db.prepare('SELECT 1 FROM annotations WHERE id=?').get(mark.id))
            throw new Error('旧批注 ID 冲突');
        writeAnnotations(annotations);
        for (const [key, value] of Object.entries(preferences)) {
          const existing = operations.preferences();
          if (existing[key] === undefined) preference({ key, value });
        }
        for (const item of cache)
          db.prepare('INSERT INTO legacy_cache VALUES (?, ?)').run(
            identifier(item.id),
            JSON.stringify(item),
          );
        if (db.prepare('PRAGMA foreign_key_check').all().length)
          throw new Error('旧库迁移关联校验失败');
        db.prepare('INSERT INTO legacy_imports VALUES (?, ?)').run(source, digest);
      }),
    books: () => db.prepare('SELECT * FROM books ORDER BY added_at DESC').all().map(metadata),
    metadata: getMetadata,
    book: (id) => {
      const book = getMetadata(id);
      if (!book) return null;
      const row = db.prepare('SELECT * FROM book_contents WHERE book_id=?').get(id);
      if (!row) throw new Error('书籍正文缺失，请重新导入');
      const assets = db
        .prepare('SELECT * FROM book_assets WHERE book_id=? ORDER BY ordinal')
        .all(id);
      const body = {
        blob: content.reference(row.hash, row.mime),
        ...(row.has_chapters
          ? {
              chapters: db
                .prepare(
                  'SELECT path, title, content FROM chapters WHERE book_id=? ORDER BY ordinal',
                )
                .all(id),
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
    updateBook: (book) =>
      transaction(() => {
        const [id, ...values] = metadataValues(book);
        if (!getMetadata(id)) return;
        db.prepare(
          `UPDATE books SET title=?, author=?, filename=?, format=?, pages=?, cover=?,
        added_at=?, opened_at=?, page=?, favorite=?, details=? WHERE id=?`,
        ).run(...values, id);
        writeBookmarks(book);
      }),
    deleteBook: (id) => {
      transaction(() => {
        db.prepare('DELETE FROM books WHERE id=?').run(identifier(id));
        db.prepare('DELETE FROM legacy_cache WHERE substr(id, 1, ?) = ?').run(
          id.length + 1,
          id + ':',
        );
      });
    },
    annotations: (id) =>
      (id === undefined || id === null
        ? db.prepare('SELECT * FROM annotations ORDER BY created_at, id').all()
        : db
            .prepare('SELECT * FROM annotations WHERE book_id=? ORDER BY created_at, id')
            .all(identifier(id))
      ).map(annotation),
    annotationCounts: () =>
      Object.fromEntries(
        db
          .prepare('SELECT book_id, count(*) AS count FROM annotations GROUP BY book_id')
          .all()
          .map((row) => [row.book_id, row.count]),
      ),
    putAnnotations: (marks) => transaction(() => writeAnnotations(marks)),
    replaceAnnotations: ({ remove, restore }) =>
      transaction(() => {
        for (const id of remove)
          db.prepare('DELETE FROM annotations WHERE id=?').run(identifier(id));
        writeAnnotations(restore);
      }),
    deleteAnnotation: (id) => {
      db.prepare('DELETE FROM annotations WHERE id=?').run(identifier(id));
    },
    preferences: () =>
      Object.fromEntries([
        ...db
          .prepare('SELECT key, value FROM preferences')
          .all()
          .map((row) => [row.key, row.value]),
        ...db
          .prepare('SELECT * FROM reading_states')
          .all()
          .map((row) => [`folio-position:${row.book_id}`, row.state]),
      ]),
    setPreference: preference,
    beginBlob: (input) => content.begin(input),
    appendBlob: (input) => content.append(input),
    finishBlob: (token) => content.finish(token),
    abortBlob: (token) => content.abort(identifier(token)),
    readBlob: (input) => content.read(input),
    release: (token) => content.release(identifier(token)),
    flush: () => {},
  };
  return {
    request(operation, input) {
      if (!Object.hasOwn(operations, operation)) throw new Error('Unknown storage operation');
      return operations[operation](input);
    },
    collect: content.collect,
    backup: (destination) => backupLibrary(db, root, destination),
    close() {
      try {
        content.close();
        db.close();
      } finally {
        unlock();
      }
    },
  };
}

module.exports = { openLibrary };

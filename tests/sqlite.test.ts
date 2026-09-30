import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openLibrary } from '../electron/storage/library.ts';
import type { ContentReference } from '../electron/storage/content.ts';
const directories: string[] = [];
const libraries: ReturnType<typeof openLibrary>[] = [];
function directory() {
  const root = mkdtempSync(path.join(tmpdir(), 'leaf-sqlite-test-'));
  directories.push(root);
  return root;
}
function open(root = directory()) {
  const library = openLibrary(root);
  libraries.push(library);
  return library;
}
function close(library: ReturnType<typeof openLibrary>) {
  library.close();
  libraries.splice(libraries.indexOf(library), 1);
}
afterEach(() => {
  for (const library of libraries.splice(0)) library.close();
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});
const metadata = (id = 'book') => ({
  id,
  title: 'Book',
  author: '',
  filename: 'book.pdf',
  pages: 3,
  page: 1,
  cover: '',
  addedAt: 1,
  openedAt: 2,
  favorite: false,
  bookmarks: [2],
  bookmarkLocations: { 2: { page: 2, ratio: 0.5 } },
});
const mark = (id = 'mark', bookId = 'book') => ({
  id,
  bookId,
  page: 1,
  start: 0,
  end: 4,
  quote: 'text',
  note: 'note',
  kind: 'highlight',
  color: 'amber',
  rects: [],
  createdAt: 1,
  source: 'text',
});
function upload(library: ReturnType<typeof openLibrary>, text = 'pdf bytes') {
  const bytes = Buffer.from(text);
  const token = library.request('beginBlob', { size: bytes.length, type: 'application/pdf' });
  library.request('appendBlob', { token, offset: 0, data: bytes.toString('base64') });
  return library.request('finishBlob', token) as ContentReference;
}
function put(library: ReturnType<typeof openLibrary>, id = 'book') {
  const blob = upload(library);
  library.request('putBook', { metadata: metadata(id), content: { blob } });
  return blob;
}
describe('SQLite library', () => {
  it('persists sidebar and notes widths across restarts', () => {
    const root = directory();
    let library = open(root);
    library.request('setPreference', { key: 'leaf-sidebar-width', value: '480' });
    library.request('setPreference', { key: 'leaf-notes-width', value: '420' });
    close(library);
    library = open(root);
    expect(library.request('preferences')).toEqual({
      'leaf-sidebar-width': '480',
      'leaf-notes-width': '420',
    });
    expect(() => library.request('setPreference', { key: 'unrelated-key', value: '1' })).toThrow(
      'Invalid preference key',
    );
  });
  it('persists books, notes, bookmarks and preferences across restarts without rewriting content on metadata edits', () => {
    const root = directory();
    let library = open(root);
    const blob = put(library);
    const filename = path.join(root, 'content', blob.hash);
    const original = statSync(filename).mtimeMs;
    library.request('putAnnotations', [mark()]);
    library.request('setPreference', { key: 'folio-position:book', value: '{"page":2}' });
    library.request('setPreference', { key: 'folio-settings', value: '{"theme":"dark"}' });
    library.request('updateBook', { ...metadata(), favorite: true });
    expect(statSync(filename).mtimeMs).toBe(original);
    expect(readdirSync(path.join(root, 'content'))).toHaveLength(1);
    close(library);
    library = open(root);
    expect(library.request('metadata', 'book')).toEqual({ ...metadata(), favorite: true });
    expect(library.request('annotations', 'book')).toEqual([mark()]);
    expect(library.request('preferences')).toEqual({
      'folio-position:book': '{"page":2}',
      'folio-settings': '{"theme":"dark"}',
    });
    expect(readFileSync(filename).toString()).toBe('pdf bytes');
  });
  it('rolls back an annotation replacement when any restored annotation is invalid', () => {
    const library = open();
    put(library);
    library.request('putAnnotations', [mark()]);
    expect(() =>
      library.request('replaceAnnotations', {
        remove: ['mark'],
        restore: [mark('valid'), mark('invalid', 'missing')],
      }),
    ).toThrow();
    expect(library.request('annotations')).toEqual([mark()]);
    expect(library.request('annotationCounts')).toEqual({ book: 1 });
  });
  it('keeps uploads and leased reads alive during collection, then cascades deletes without resurrection', () => {
    const root = directory();
    const library = open(root);
    const blob = upload(library);
    library.collect();
    expect(readdirSync(path.join(root, 'content'))).toEqual([blob.hash]);
    library.request('putBook', { metadata: metadata(), content: { blob } });
    library.request('putAnnotations', [mark()]);
    library.request('setPreference', { key: 'folio-position:book', value: '{"page":2}' });
    const read = library.request('book', 'book') as { lease: string };
    library.request('deleteBook', 'book');
    library.collect();
    expect(
      Buffer.from(
        library.request('readBlob', { token: read.lease, hash: blob.hash, offset: 0 }) as string,
        'base64',
      ).toString(),
    ).toBe('pdf bytes');
    library.request('updateBook', metadata());
    library.request('setPreference', { key: 'folio-position:book', value: '{"page":3}' });
    expect(library.request('book', 'book')).toBeNull();
    expect(library.request('annotations')).toEqual([]);
    expect(library.request('preferences')).toEqual({});
    library.request('release', read.lease);
    library.collect();
    expect(readdirSync(path.join(root, 'content'))).toEqual([]);
  });
  it('commits legacy imports atomically and records the source digest for idempotent retry', () => {
    const library = open();
    const blob = upload(library);
    const input = {
      source: 'origin',
      digest: 'snapshot',
      books: [{ metadata: metadata(), content: { blob } }],
      annotations: [mark('bad', 'missing')],
      preferences: { 'folio-initialized': '1' },
      cache: [],
    };
    expect(() => library.request('importLegacy', input)).toThrow();
    expect(library.request('books')).toEqual([]);
    expect(library.request('legacyReceipt', 'origin')).toBeUndefined();
    input.annotations = [mark()];
    library.request('importLegacy', input);
    library.request('importLegacy', input);
    expect(library.request('books')).toHaveLength(1);
    expect(library.request('legacyReceipt', 'origin')).toBe('snapshot');
    expect(() => library.request('importLegacy', { ...input, digest: 'changed' })).toThrow(/旧库/);
  });
  it('rejects malformed chunks, unknown commands, concurrent owners and altered migration history', () => {
    const root = directory();
    const library = open(root);
    expect(() => openLibrary(root)).toThrow();
    expect(() => library.request('exec', 'DROP TABLE books')).toThrow();
    const token = library.request('beginBlob', { size: 5, type: '' });
    expect(() => library.request('appendBlob', { token, offset: 2, data: 'YWJj' })).toThrow();
    expect(() => library.request('finishBlob', token)).toThrow();
    close(library);
    const db = new DatabaseSync(path.join(root, 'library.sqlite'));
    db.exec("UPDATE schema_migrations SET checksum='changed'");
    db.close();
    expect(() => openLibrary(root)).toThrow(/迁移记录/);
  });
  it('persists ask threads in order, rejects gaps in input and cascades book deletion', () => {
    const root = directory();
    let library = open(root);
    put(library);
    const thread = {
      id: 'thread',
      bookId: 'book',
      page: 2,
      start: 5,
      end: 9,
      quote: 'text',
      createdAt: 3,
    };
    library.request('putAskThread', thread);
    library.request('putAskThread', thread);
    library.request('putAskMessage', {
      threadId: 'thread',
      ordinal: 0,
      role: 'user',
      content: 'why?',
      createdAt: 4,
    });
    library.request('putAskMessage', {
      threadId: 'thread',
      ordinal: 1,
      role: 'assistant',
      content: 'because [p.2]',
      model: 'deepseek-chat',
      createdAt: 5,
    });
    expect(() =>
      library.request('putAskMessage', {
        threadId: 'thread',
        ordinal: 1,
        role: 'user',
        content: 'duplicate ordinal',
        createdAt: 6,
      }),
    ).toThrow();
    expect(() =>
      library.request('putAskMessage', {
        threadId: 'thread',
        ordinal: 2,
        role: 'system',
        content: 'x',
        createdAt: 6,
      }),
    ).toThrow('Invalid ask message');
    expect(() =>
      library.request('putAskThread', { ...thread, id: 'x', bookId: 'missing' }),
    ).toThrow();
    close(library);
    library = open(root);
    expect(library.request('askThreads', 'book')).toEqual([
      {
        ...thread,
        messages: [
          { role: 'user', content: 'why?', createdAt: 4 },
          { role: 'assistant', content: 'because [p.2]', model: 'deepseek-chat', createdAt: 5 },
        ],
      },
    ]);
    library.request('deleteBook', 'book');
    const db = new DatabaseSync(path.join(root, 'library.sqlite'));
    expect(db.prepare('SELECT count(*) AS count FROM ask_messages').get()).toEqual({ count: 0 });
    db.close();
  });
  it('upgrades a version 1 library to add ask tables after backing it up', () => {
    const root = directory();
    close(open(root));
    const db = new DatabaseSync(path.join(root, 'library.sqlite'));
    db.exec(`DROP TABLE ask_messages; DROP TABLE ask_threads;
      DELETE FROM schema_migrations WHERE version > 1; PRAGMA user_version = 1;`);
    db.close();
    const library = open(root);
    expect(library.request('askThreads', 'book')).toEqual([]);
    expect(readdirSync(path.join(root, 'backups')).some((name) => name.startsWith('schema-'))).toBe(
      true,
    );
  });
  it('creates a consistent backup including content and rejects corrupt content', () => {
    const root = directory();
    const library = open(root);
    const blob = put(library);
    const backup = path.join(directory(), 'snapshot');
    library.backup(backup);
    const restored = open(backup);
    expect(restored.request('metadata', 'book')).toEqual(metadata());
    expect(
      JSON.parse(readFileSync(path.join(backup, 'manifest.json'), 'utf8')).entries,
    ).toHaveLength(1);
    writeFileSync(path.join(root, 'content', blob.hash), 'corruption');
    expect(() => library.backup(path.join(directory(), 'bad'))).toThrow(/校验失败/);
  });
  it('restores a verified backup into a new directory and never overwrites an existing library', () => {
    const root = directory();
    const library = open(root);
    put(library);
    const backup = path.join(directory(), 'backup');
    library.backup(backup);
    const target = path.join(directory(), 'restored');
    execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, target]);
    const restored = open(target);
    expect(restored.request('metadata', 'book')).toEqual(metadata());
    expect(() =>
      execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, target], {
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});

import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStorage, type StorageRepository } from '../electron/storage/repositories/index.ts';
import type { DocumentRecord } from '@leaf/contracts/documents';
const roots: string[] = [],
  stores: StorageRepository[] = [];
function directory() {
  const root = mkdtempSync(path.join(tmpdir(), 'leaf-storage-'));
  roots.push(root);
  return root;
}
function open(root = directory()) {
  const store = openStorage(root);
  stores.push(store);
  return store;
}
function insert(store: StorageRepository) {
  const data = Buffer.from('Source document'),
    token = store.request('content.begin', { size: data.length, mime: 'text/plain' });
  store.request('content.append', { token, offset: 0, data: data.toString('base64') });
  const resource = store.request('content.finish', token);
  const record: DocumentRecord = {
    metadata: {
      id: 'document',
      revision: resource.hash,
      formatId: 'test.text',
      title: 'Document',
      author: '',
      filename: 'doc.txt',
      cover: '',
      addedAt: 1,
      openedAt: 0,
      favorite: false,
      progress: { fraction: 0, label: '' },
    },
    source: {
      resources: [
        { path: 'doc.txt', hash: resource.hash, size: resource.size, mime: resource.mime },
      ],
      data: {},
    },
  };
  store.request('library.put', {
    ...record,
    uploads: [{ hash: resource.hash, token: resource.token! }],
  });
  return record;
}
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
describe('SQLite durability', () => {
  it('persists settings and metadata without rewriting source bytes', () => {
    const root = directory(),
      store = open(root),
      record = insert(store),
      file = path.join(root, 'content', record.source.resources[0].hash),
      before = statSync(file).mtimeMs;
    store.request('settings.set', { key: 'ui.sidebar-width', value: '440' });
    store.request('library.update', { ...record.metadata, favorite: true });
    expect(statSync(file).mtimeMs).toBe(before);
    store.close();
    const reopened = open(root);
    expect(reopened.request('library.list', undefined)[0].favorite).toBe(true);
    expect(reopened.request('settings.list', undefined)).toEqual({ 'ui.sidebar-width': '440' });
  });
  it('rejects concurrent writers, unknown operations, and malformed uploads', () => {
    const root = directory(),
      store = open(root);
    expect(() => openStorage(root)).toThrow();
    expect(() => store.requestRaw('exec', 'DROP TABLE documents')).toThrow();
    const token = store.request('content.begin', { size: 5, mime: '' });
    expect(() => store.request('content.append', { token, offset: 2, data: 'YWJj' })).toThrow();
    expect(() => store.request('content.finish', token)).toThrow();
  });
  it('backs up referenced resources and restores only into a new directory', () => {
    const root = directory(),
      store = open(root),
      record = insert(store),
      backup = path.join(directory(), 'snapshot');
    store.backup(backup);
    expect(JSON.parse(readFileSync(path.join(backup, 'manifest.json'), 'utf8'))).toMatchObject({
      format: 'leaf.reader',
      version: 1,
    });
    const target = path.join(directory(), 'restored');
    execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, target]);
    expect(open(target).request('library.list', undefined)).toEqual([record.metadata]);
    expect(() =>
      execFileSync(process.execPath, ['scripts/library-backup.mjs', 'restore', backup, target], {
        stdio: 'pipe',
      }),
    ).toThrow();
    writeFileSync(path.join(root, 'content', record.source.resources[0].hash), 'corruption');
    expect(() => store.backup(path.join(directory(), 'invalid'))).toThrow('校验失败');
  });
});

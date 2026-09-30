import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStorage, type StorageRepository } from '../../electron/storage/repositories/index.ts';
import type { DocumentRecord, Annotation, Locator } from '@leaf/contracts';

const roots: string[] = [];
const stores: StorageRepository[] = [];
function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leaf-new-storage-'));
  roots.push(root);
  const value = openStorage(root);
  stores.push(value);
  return { root, value };
}
function insert(value: StorageRepository, id = 'document') {
  const data = Buffer.from('New reader document');
  const token = value.request('content.begin', { size: data.length, mime: 'text/plain' });
  value.request('content.append', { token, offset: 0, data: data.toString('base64') });
  const uploaded = value.request('content.finish', token);
  const document: DocumentRecord = {
    metadata: {
      id,
      revision: uploaded.hash,
      formatId: 'test.text',
      title: 'Document',
      author: '',
      filename: 'document.txt',
      cover: '',
      addedAt: 1,
      openedAt: 0,
      favorite: false,
      progress: { fraction: 0, label: '' },
    },
    source: {
      resources: [
        { path: 'document.txt', hash: uploaded.hash, size: uploaded.size, mime: uploaded.mime },
      ],
      data: {},
    },
  };
  value.request('library.put', {
    ...document,
    uploads: [{ hash: uploaded.hash, token: uploaded.token! }],
  });
  return document;
}
function anchor(document: DocumentRecord): Locator {
  return {
    documentId: document.metadata.id,
    revision: document.metadata.revision,
    schema: 'test.text',
    version: 1,
    payload: { start: 0, end: 3 },
  };
}
function mark(document: DocumentRecord, id = 'mark'): Annotation {
  return {
    id,
    documentId: document.metadata.id,
    targets: [anchor(document)],
    quote: 'New',
    kind: 'highlight',
    color: 'amber',
    note: '',
    createdAt: 1,
  };
}

afterEach(() => {
  for (const value of stores.splice(0)) value.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('new reader storage', () => {
  it('stores open format IDs and referenced resources across reopen', () => {
    const { root, value } = store();
    const document = insert(value);
    const loaded = value.request('library.get', document.metadata.id)!;
    expect(loaded.metadata.formatId).toBe('test.text');
    expect(
      value.request('content.read', {
        reference: loaded.source.resources[0],
        token: loaded.lease,
        offset: 0,
      }),
    ).toBe(Buffer.from('New reader document').toString('base64'));
    value.request('content.release', loaded.lease);
    value.close();
    const reopened = openStorage(root);
    stores.push(reopened);
    expect(reopened.request('library.list', undefined)).toEqual([document.metadata]);
  });
  it('commits multi-anchor annotations atomically and validates document ownership', () => {
    const { value } = store();
    const document = insert(value);
    const initial = mark(document);
    value.request('annotations.commit', {
      documentId: document.metadata.id,
      remove: [],
      put: [initial],
    });
    const invalid = {
      ...mark(document, 'invalid'),
      targets: [{ ...anchor(document), documentId: 'another' }],
    };
    expect(() =>
      value.request('annotations.commit', {
        documentId: document.metadata.id,
        remove: [initial.id],
        put: [invalid],
      }),
    ).toThrow();
    expect(value.request('annotations.list', document.metadata.id)).toEqual([initial]);
  });
  it('keeps plugin data through uninstall and clears document-scoped data on document deletion', () => {
    const { value } = store();
    const document = insert(value);
    value.request('plugins.data.set', {
      pluginId: 'leaf.ai',
      key: 'thread',
      documentId: document.metadata.id,
      value: { answer: 'Saved' },
    });
    value.request('plugins.data.set', {
      pluginId: 'leaf.ai',
      key: 'configuration',
      value: { model: 'test' },
    });
    value.request('plugins.remove', 'leaf.ai');
    expect(
      value.request('plugins.data.get', {
        pluginId: 'leaf.ai',
        key: 'thread',
        documentId: document.metadata.id,
      }),
    ).toEqual({ answer: 'Saved' });
    value.request('library.delete', document.metadata.id);
    expect(
      value.request('plugins.data.get', {
        pluginId: 'leaf.ai',
        key: 'thread',
        documentId: document.metadata.id,
      }),
    ).toBeNull();
    expect(
      value.request('plugins.data.get', { pluginId: 'leaf.ai', key: 'configuration' }),
    ).toEqual({ model: 'test' });
  });
  it('does not resurrect deleted documents through a late position or metadata write', () => {
    const { value } = store();
    const document = insert(value);
    value.request('library.delete', document.metadata.id);
    value.request('reader.savePosition', {
      documentId: document.metadata.id,
      position: { locator: anchor(document), settings: {}, viewport: {} },
    });
    value.request('library.update', document.metadata);
    expect(value.request('library.list', undefined)).toEqual([]);
  });
  it('protects source content while a document read holds a lease', () => {
    const { root, value } = store();
    const document = insert(value);
    const loaded = value.request('library.get', document.metadata.id)!;
    const file = path.join(root, 'content', loaded.source.resources[0].hash);
    value.request('library.delete', document.metadata.id);
    expect(fs.existsSync(file)).toBe(true);
    value.request('content.release', loaded.lease);
    value.collect();
    expect(fs.existsSync(file)).toBe(false);
  });
  it('rejects databases belonging to another application', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'leaf-unrecognized-'));
    roots.push(root);
    const database = new DatabaseSync(path.join(root, 'library.sqlite'));
    database.exec('CREATE TABLE unrelated (id TEXT)');
    database.close();
    expect(() => openStorage(root)).toThrow('无法识别');
  });
});

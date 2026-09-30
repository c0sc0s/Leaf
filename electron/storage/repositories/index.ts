import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  StorageOperations,
  StorageOperation,
  StorageInput,
  StorageOutput,
  InstalledPlugin,
} from '@leaf/contracts/transport';
import type {
  DocumentMetadata,
  DocumentRecord,
  ResourceReference,
  Annotation,
  Bookmark,
  TaskEvent,
} from '@leaf/contracts';
import {
  identifier,
  json,
  metadata,
  documentRecord,
  annotation,
  position,
  manifest,
} from '@leaf/contracts/validation';
import { jsonObject } from '@leaf/shared/types';
import { initializeSchema } from '../schema/index.ts';
import { createContentStore } from '../content.ts';
import { backupLibrary } from '../backup.ts';

type Handlers = { [K in StorageOperation]: (input: StorageInput<K>) => StorageOutput<K> };
type DocumentRow = {
  id: string;
  revision: string;
  format_id: string;
  metadata: string;
  source_data: string;
};

export function openStorage(root: string) {
  fs.mkdirSync(root, { recursive: true });
  const lockPath = path.join(root, '.writer-lock');
  const owner = { pid: process.pid, token: randomUUID() };
  if (fs.existsSync(lockPath)) {
    const previous = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number };
    try {
      process.kill(previous.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      fs.rmSync(lockPath);
    }
  }
  const descriptor = fs.openSync(lockPath, 'wx');
  fs.writeFileSync(descriptor, JSON.stringify(owner));
  fs.closeSync(descriptor);
  const unlock = () => {
    if (
      fs.existsSync(lockPath) &&
      JSON.parse(fs.readFileSync(lockPath, 'utf8')).token === owner.token
    )
      fs.rmSync(lockPath);
  };
  let db: DatabaseSync;
  let opened: DatabaseSync | undefined;
  let content: ReturnType<typeof createContentStore>;
  try {
    db = opened = new DatabaseSync(path.join(root, 'library.sqlite'));
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    initializeSchema(db);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    content = createContentStore(root, db);
  } catch (error) {
    opened?.close();
    unlock();
    throw error;
  }
  let closed = false;
  const one = <T>(sql: string, ...args: SQLInputValue[]) =>
    db.prepare(sql).get(...args) as T | undefined;
  const all = <T>(sql: string, ...args: SQLInputValue[]) => db.prepare(sql).all(...args) as T[];
  const execute = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).run(...args);
  const transaction = <T>(run: () => T) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = run();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const row = (id: string) =>
    one<DocumentRow>('SELECT * FROM documents WHERE id=?', identifier(id));
  const requireDocument = (id: string) => {
    const value = row(id);
    if (!value) throw new Error('文档已移除');
    return value;
  };
  const readMetadata = (entry: DocumentRow): DocumentMetadata => JSON.parse(entry.metadata);
  const references = (id: string): ResourceReference[] =>
    all<{ path: string; hash: string; mime: string; size: number }>(
      `SELECT r.path,r.hash,r.mime,c.size FROM document_resources r JOIN content_objects c ON c.hash=r.hash WHERE r.document_id=? ORDER BY r.path`,
      id,
    );
  const plugins = (): InstalledPlugin[] =>
    all<{ manifest: string; enabled: number; installed_at: number; package_hash: string }>(
      'SELECT manifest,enabled,installed_at,package_hash FROM plugins ORDER BY id',
    ).map((entry) => ({
      manifest: JSON.parse(entry.manifest),
      enabled: !!entry.enabled,
      installedAt: entry.installed_at,
      packageHash: entry.package_hash,
    }));
  const reader = (entry: InstalledPlugin) =>
    entry.enabled &&
    !!entry.manifest.contributes.documentProviders?.length &&
    !!entry.manifest.contributes.views?.length;
  const checkPluginRemoval = (id: string) => {
    const installed = plugins();
    if (
      installed.some(
        (entry) => entry.enabled && entry.manifest.id !== id && entry.manifest.dependencies[id],
      )
    )
      throw new Error('仍有启用插件依赖此插件');
    const target = installed.find((entry) => entry.manifest.id === id);
    if (
      target &&
      reader(target) &&
      !installed.some((entry) => entry.manifest.id !== id && reader(entry))
    )
      throw new Error('至少需要保留一个启用的阅读插件');
  };
  const pluginKey = (input: { pluginId: string; key: string; documentId?: string }) =>
    [
      identifier(input.pluginId),
      input.documentId === undefined ? '' : identifier(input.documentId),
      identifier(input.key),
    ] as const;

  const handlers: Handlers = {
    'library.list': () =>
      all<DocumentRow>(
        "SELECT * FROM documents ORDER BY json_extract(metadata,'$.addedAt') DESC,id",
      ).map(readMetadata),
    'library.find': (input) => {
      const entry = one<DocumentRow>(
        'SELECT * FROM documents WHERE format_id=? AND revision=?',
        identifier(input.formatId),
        identifier(input.revision),
      );
      return entry ? readMetadata(entry) : null;
    },
    'library.get': (id) => {
      const entry = row(id);
      if (!entry) return null;
      const resources = references(id);
      for (const reference of resources) content.reference(reference.hash, reference.mime);
      return {
        metadata: readMetadata(entry),
        source: { resources, data: JSON.parse(entry.source_data) },
        lease: content.acquire(resources.map((entry) => entry.hash)),
      };
    },
    'library.put': (input) => {
      const document = documentRecord(input);
      if (!Array.isArray(input.uploads)) throw new Error('Missing upload ownership');
      for (const reference of document.source.resources) {
        const upload = input.uploads.find((entry) => entry.hash === reference.hash);
        if (!upload) throw new Error('Missing content upload');
        const stored = content.reference(reference.hash, reference.mime);
        if (stored.size !== reference.size) throw new Error('Resource size does not match');
        content.validateUpload({ ...stored, token: identifier(upload.token) });
      }
      transaction(() => {
        const meta = document.metadata;
        execute(
          'INSERT INTO documents VALUES (?,?,?,?,?)',
          meta.id,
          meta.revision,
          meta.formatId,
          JSON.stringify(meta),
          JSON.stringify(document.source.data),
        );
        for (const reference of document.source.resources)
          execute(
            'INSERT INTO document_resources VALUES (?,?,?,?)',
            meta.id,
            reference.path,
            reference.hash,
            reference.mime,
          );
        for (const upload of input.uploads) content.release(identifier(upload.token));
      });
    },
    'library.update': (input) => {
      const value = metadata(input);
      const previous = row(value.id);
      if (!previous) return;
      if (previous.revision !== value.revision || previous.format_id !== value.formatId)
        throw new Error('Document identity is immutable');
      execute('UPDATE documents SET metadata=? WHERE id=?', JSON.stringify(value), value.id);
    },
    'library.delete': (id) => {
      transaction(() => {
        execute('DELETE FROM documents WHERE id=?', identifier(id));
      });
      content.collect();
    },
    'annotations.list': (id) =>
      all<{ value: string }>(
        "SELECT value FROM annotations WHERE document_id=? ORDER BY json_extract(value,'$.createdAt'),id",
        identifier(id),
      ).map((entry) => JSON.parse(entry.value)),
    'annotations.counts': () =>
      Object.fromEntries(
        all<{ document_id: string; count: number }>(
          'SELECT document_id,COUNT(*) AS count FROM annotations GROUP BY document_id',
        ).map((entry) => [entry.document_id, entry.count]),
      ),
    'annotations.commit': (input) => {
      const document = requireDocument(input.documentId);
      if (!Array.isArray(input.remove) || !Array.isArray(input.put))
        throw new Error('Invalid annotation transaction');
      const marks = input.put.map((value) => annotation(value, document.id, document.revision));
      transaction(() => {
        for (const id of input.remove)
          execute(
            'DELETE FROM annotations WHERE id=? AND document_id=?',
            identifier(id),
            document.id,
          );
        for (const mark of marks) {
          const owner = one<{ document_id: string }>(
            'SELECT document_id FROM annotations WHERE id=?',
            mark.id,
          );
          if (owner && owner.document_id !== document.id)
            throw new Error('Annotation belongs to another document');
          execute(
            'INSERT INTO annotations VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
            mark.id,
            document.id,
            JSON.stringify(mark),
          );
        }
      });
    },
    'reader.position': (id) => {
      const entry = one<{ value: string }>(
        'SELECT value FROM reading_positions WHERE document_id=?',
        identifier(id),
      );
      return entry ? JSON.parse(entry.value) : null;
    },
    'reader.savePosition': (input) => {
      const document = row(input.documentId);
      if (!document) return;
      const value = position(input.position, document.id, document.revision);
      execute(
        'INSERT INTO reading_positions VALUES (?,?) ON CONFLICT(document_id) DO UPDATE SET value=excluded.value',
        document.id,
        JSON.stringify(value),
      );
    },
    'reader.bookmarks': (id) =>
      all<{ value: string }>(
        "SELECT value FROM bookmarks WHERE document_id=? ORDER BY json_extract(value,'$.createdAt')",
        identifier(id),
      ).map((entry) => JSON.parse(entry.value)),
    'reader.putBookmark': (input) => {
      const document = requireDocument(input.documentId);
      const item = jsonObject(input);
      identifier(item.id);
      if (
        typeof item.title !== 'string' ||
        typeof item.createdAt !== 'number' ||
        !Number.isFinite(item.createdAt)
      )
        throw new Error('Invalid bookmark');
      position(item.position, document.id, document.revision);
      const existing = one<{ document_id: string }>(
        'SELECT document_id FROM bookmarks WHERE id=?',
        input.id,
      );
      if (existing && existing.document_id !== document.id)
        throw new Error('Bookmark belongs to another document');
      execute(
        'INSERT INTO bookmarks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
        input.id,
        document.id,
        JSON.stringify(input),
      );
    },
    'reader.deleteBookmark': (id) => {
      execute('DELETE FROM bookmarks WHERE id=?', identifier(id));
    },
    'settings.list': () =>
      Object.fromEntries(
        all<{ key: string; value: string }>('SELECT * FROM settings').map((entry) => [
          entry.key,
          JSON.parse(entry.value),
        ]),
      ),
    'settings.set': (input) => {
      execute(
        'INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        identifier(input.key),
        JSON.stringify(json(input.value)),
      );
    },
    'plugins.list': plugins,
    'plugins.bind': (input) => {
      const value = manifest(input.manifest);
      if (
        typeof input.enabled !== 'boolean' ||
        !Number.isFinite(input.installedAt) ||
        !/^[a-f0-9]{64}$/.test(input.packageHash)
      )
        throw new Error('Invalid plugin binding');
      const previous = plugins().find((entry) => entry.manifest.id === value.id);
      if (previous && reader(previous) && !reader(input)) checkPluginRemoval(value.id);
      transaction(() => {
        execute(
          'INSERT INTO plugins VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,enabled=excluded.enabled,manifest=excluded.manifest,installed_at=excluded.installed_at,package_hash=excluded.package_hash',
          value.id,
          value.version,
          input.enabled ? 1 : 0,
          JSON.stringify(value),
          input.installedAt,
          input.packageHash,
        );
      });
    },
    'plugins.enable': (input) => {
      if (typeof input.enabled !== 'boolean') throw new Error('Invalid plugin enabled flag');
      transaction(() => {
        if (!input.enabled) checkPluginRemoval(identifier(input.id));
        execute(
          'UPDATE plugins SET enabled=? WHERE id=?',
          input.enabled ? 1 : 0,
          identifier(input.id),
        );
      });
    },
    'plugins.remove': (id) => {
      transaction(() => {
        checkPluginRemoval(identifier(id));
        execute('DELETE FROM plugins WHERE id=?', id);
      });
    },
    'plugins.data.get': (input) => {
      const entry = one<{ value: string }>(
        'SELECT value FROM plugin_data WHERE plugin_id=? AND scope=? AND key=?',
        ...pluginKey(input),
      );
      return entry ? JSON.parse(entry.value) : null;
    },
    'plugins.data.set': (input) => {
      const [pluginId, scope, key] = pluginKey(input);
      if (input.documentId) requireDocument(input.documentId);
      execute(
        'INSERT INTO plugin_data VALUES (?,?,?,?,?) ON CONFLICT(plugin_id,scope,key) DO UPDATE SET value=excluded.value',
        pluginId,
        scope,
        key,
        input.documentId ?? null,
        JSON.stringify(json(input.value)),
      );
    },
    'plugins.data.delete': (input) => {
      execute(
        'DELETE FROM plugin_data WHERE plugin_id=? AND scope=? AND key=?',
        ...pluginKey(input),
      );
    },
    'plugins.data.list': (input) => {
      const prefix = typeof input.prefix === 'string' ? input.prefix : '';
      return all<{ key: string; value: string }>(
        'SELECT key,value FROM plugin_data WHERE plugin_id=? AND scope=? AND substr(key,1,?)=? ORDER BY key',
        identifier(input.pluginId),
        input.documentId ?? '',
        prefix.length,
        prefix,
      ).map((entry) => ({ key: entry.key, value: JSON.parse(entry.value) }));
    },
    'tasks.report': (input) => {
      identifier(input.pluginId);
      identifier(input.runId);
      identifier(input.name);
      if (input.parentId !== undefined) identifier(input.parentId);
      if (
        !['start', 'progress', 'complete', 'failed', 'cancelled'].includes(input.phase) ||
        !Number.isFinite(input.at)
      )
        throw new Error('Invalid task event');
      json(input);
      execute(
        'INSERT INTO task_events(plugin_id,run_id,value) VALUES (?,?,?)',
        input.pluginId,
        input.runId,
        JSON.stringify(input),
      );
    },
    'tasks.list': (input) =>
      (input.runId
        ? all<{ value: string }>(
            `WITH RECURSIVE runs(id) AS (SELECT ? UNION SELECT task.run_id FROM task_events task JOIN runs ON json_extract(task.value,'$.parentId')=runs.id WHERE task.plugin_id=?) SELECT value FROM task_events WHERE plugin_id=? AND run_id IN (SELECT id FROM runs) ORDER BY sequence`,
            identifier(input.runId),
            identifier(input.pluginId),
            input.pluginId,
          )
        : all<{ value: string }>(
            'SELECT value FROM task_events WHERE plugin_id=? ORDER BY sequence',
            identifier(input.pluginId),
          )
      ).map((entry) => JSON.parse(entry.value)),
    'content.begin': (input) => content.begin(input),
    'content.append': (input) => content.append(input),
    'content.finish': (token) => content.finish(identifier(token)),
    'content.abort': (token) => content.abort(identifier(token)),
    'content.read': (input) =>
      content.read({
        token: identifier(input.token),
        hash: input.reference.hash,
        offset: input.offset,
      }),
    'content.release': (token) => content.release(identifier(token)),
    flush: () => {
      db.exec('PRAGMA wal_checkpoint(FULL)');
    },
  };

  return {
    request<K extends StorageOperation>(operation: K, input: StorageInput<K>): StorageOutput<K> {
      return handlers[operation](input);
    },
    requestRaw(operation: unknown, input?: unknown): unknown {
      if (closed || typeof operation !== 'string' || !Object.hasOwn(handlers, operation))
        throw new Error('Invalid storage operation');
      if (input !== undefined) json(input);
      return (handlers[operation as StorageOperation] as (input: unknown) => unknown)(input);
    },
    collect: () => content.collect(),
    backup: (destination: string) => backupLibrary(db, root, destination),
    close() {
      if (closed) return;
      closed = true;
      try {
        content.close();
        content.collect();
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        db.close();
      } finally {
        unlock();
      }
    },
  };
}

export type StorageRepository = ReturnType<typeof openStorage>;
export type { Annotation, Bookmark, DocumentRecord, TaskEvent, StorageOperations };

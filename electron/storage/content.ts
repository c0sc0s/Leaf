import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID, type Hash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const chunkSize = 1024 * 1024;
const maxBytes = 512 * 1024 * 1024;
const validHash = /^[a-f0-9]{64}$/;

import type { ContentReference } from '@leaf/contracts/transport';

interface Upload {
  descriptor: number | undefined;
  filename: string;
  size: number;
  mime: string;
  written: number;
  hash: Hash;
}

export const hashFile = (filename: string) => {
  const hash = createHash('sha256');
  const descriptor = fs.openSync(filename, 'r');
  try {
    const buffer = Buffer.allocUnsafe(chunkSize);
    let length;
    while ((length = fs.readSync(descriptor, buffer, 0, buffer.length, null)))
      hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally {
    fs.closeSync(descriptor);
  }
};

export type ContentStore = ReturnType<typeof createContentStore>;

export function createContentStore(root: string, db: DatabaseSync) {
  const directory = path.join(root, 'content');
  const staging = path.join(root, 'staging');
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(staging, { recursive: true });
  const uploads = new Map<string, Upload>();
  const file = (hash: unknown) => {
    if (typeof hash !== 'string' || !validHash.test(hash)) throw new Error('Invalid content hash');
    return path.join(directory, hash);
  };
  const pin = db.prepare('INSERT OR IGNORE INTO content_pins VALUES (?, ?)');
  const release = (owner: string) => {
    db.prepare('DELETE FROM content_pins WHERE owner=?').run(owner);
  };
  const reference = (hash: string, mime: string): ContentReference => {
    const entry = db.prepare('SELECT size FROM content_objects WHERE hash=?').get(hash) as
      { size: number } | undefined;
    if (!entry || fs.statSync(file(hash)).size !== entry.size)
      throw new Error('书籍内容缺失或损坏');
    return { hash, size: entry.size, mime };
  };
  const collect = () => {
    const unused = db
      .prepare(
        `SELECT hash FROM content_objects c
      WHERE NOT EXISTS (SELECT 1 FROM content_pins WHERE hash=c.hash)
      AND NOT EXISTS (SELECT 1 FROM document_resources WHERE hash=c.hash)`,
      )
      .all() as { hash: string }[];
    for (const { hash } of unused) {
      fs.rmSync(file(hash), { force: true });
      db.prepare('DELETE FROM content_objects WHERE hash=?').run(hash);
    }
  };
  const abort = (token: string) => {
    const upload = uploads.get(token);
    if (upload) {
      if (upload.descriptor !== undefined) fs.closeSync(upload.descriptor);
      fs.rmSync(upload.filename, { force: true });
      uploads.delete(token);
    }
    release(token);
  };
  // All content commands and reference transactions run on the same serial worker.
  // Startup happens before clients reconnect, so process-owned pins can be released.
  db.prepare('DELETE FROM content_pins').run();
  for (const entry of fs.readdirSync(staging))
    if (/^[a-f0-9-]{36}\.upload$/.test(entry))
      fs.rmSync(path.join(staging, entry), { force: true });
  for (const entry of fs.readdirSync(directory))
    if (
      validHash.test(entry) &&
      !db.prepare('SELECT 1 FROM content_objects WHERE hash=?').get(entry)
    )
      fs.rmSync(file(entry), { force: true });
  collect();

  return {
    file,
    reference,
    hashFile,
    collect,
    release,
    abort,
    begin({ size, mime }: { size: number; mime: string }) {
      if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes || typeof mime !== 'string')
        throw new Error('Invalid content upload');
      const token = randomUUID();
      const filename = path.join(staging, `${token}.upload`);
      const descriptor = fs.openSync(filename, 'wx');
      uploads.set(token, {
        descriptor,
        filename,
        size,
        mime,
        written: 0,
        hash: createHash('sha256'),
      });
      return token;
    },
    append({ token, offset, data }: { token: string; offset: number; data: string }) {
      const upload = uploads.get(token);
      if (
        !upload ||
        upload.descriptor === undefined ||
        offset !== upload.written ||
        typeof data !== 'string' ||
        data.length > Math.ceil(chunkSize / 3) * 4
      )
        throw new Error('Invalid upload chunk');
      const buffer = Buffer.from(data, 'base64');
      if (
        !buffer.length ||
        buffer.length > chunkSize ||
        upload.written + buffer.length > upload.size
      )
        throw new Error('Invalid upload size');
      let written = 0;
      while (written < buffer.length)
        written += fs.writeSync(upload.descriptor, buffer, written, buffer.length - written);
      upload.hash.update(buffer);
      upload.written += buffer.length;
    },
    finish(token: string): ContentReference {
      const upload = uploads.get(token);
      if (!upload || upload.descriptor === undefined || upload.size !== upload.written)
        throw new Error('Incomplete content upload');
      fs.fsyncSync(upload.descriptor);
      fs.closeSync(upload.descriptor);
      upload.descriptor = undefined;
      const hash = upload.hash.digest('hex');
      const destination = file(hash);
      if (fs.existsSync(destination)) {
        if (hashFile(destination) !== hash) throw new Error('内容校验失败');
        fs.rmSync(upload.filename);
      } else fs.renameSync(upload.filename, destination);
      if (process.platform !== 'win32') {
        const dir = fs.openSync(directory, 'r');
        try {
          fs.fsyncSync(dir);
        } finally {
          fs.closeSync(dir);
        }
      }
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT OR IGNORE INTO content_objects VALUES (?, ?)').run(hash, upload.size);
        pin.run(token, hash);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      uploads.delete(token);
      return { hash, size: upload.size, mime: upload.mime, token };
    },
    validateUpload(blob: ContentReference) {
      reference(blob.hash, blob.mime);
      if (
        typeof blob.token !== 'string' ||
        !db
          .prepare('SELECT 1 FROM content_pins WHERE owner=? AND hash=?')
          .get(blob.token, blob.hash)
      )
        throw new Error('Content upload is not owned by this operation');
    },
    acquire(hashes: string[]) {
      const token = randomUUID();
      for (const hash of hashes) pin.run(token, hash);
      return token;
    },
    read({ token, hash, offset }: { token: string; hash: string; offset: number }) {
      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !db.prepare('SELECT 1 FROM content_pins WHERE owner=? AND hash=?').get(token, hash)
      )
        throw new Error('Invalid content read');
      const descriptor = fs.openSync(file(hash), 'r');
      try {
        const buffer = Buffer.allocUnsafe(chunkSize);
        const length = fs.readSync(descriptor, buffer, 0, buffer.length, offset);
        return buffer.subarray(0, length).toString('base64');
      } finally {
        fs.closeSync(descriptor);
      }
    },
    close() {
      for (const token of uploads.keys()) abort(token);
    },
  };
}

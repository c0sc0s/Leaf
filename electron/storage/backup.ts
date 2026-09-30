import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashFile } from './content.ts';

export function backupLibrary(db: DatabaseSync, root: string, destination: string) {
  if (fs.existsSync(destination)) throw new Error('备份目标已存在');
  fs.mkdirSync(destination, { recursive: true });
  db.prepare('VACUUM INTO ?').run(path.join(destination, 'library.sqlite'));
  fs.mkdirSync(path.join(destination, 'content'));
  const entries = db
    .prepare(
      `SELECT DISTINCT c.hash, c.size FROM content_objects c
    WHERE EXISTS (SELECT 1 FROM document_resources WHERE hash=c.hash)`,
    )
    .all() as { hash: string; size: number }[];
  for (const entry of entries) {
    if (!/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error('无效内容哈希');
    const target = path.join(destination, 'content', entry.hash);
    fs.copyFileSync(path.join(root, 'content', entry.hash), target);
    if (fs.statSync(target).size !== entry.size || hashFile(target) !== entry.hash)
      throw new Error('备份内容校验失败');
  }
  const snapshot = new DatabaseSync(path.join(destination, 'library.sqlite'));
  try {
    snapshot.exec('PRAGMA foreign_keys=ON; DELETE FROM content_pins;');
    snapshot.exec(`DELETE FROM content_objects WHERE hash NOT IN
      (SELECT hash FROM document_resources);`);
    if (
      snapshot.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok' ||
      snapshot.prepare('PRAGMA foreign_key_check').all().length
    )
      throw new Error('备份数据库校验失败');
  } finally {
    snapshot.close();
  }
  fs.writeFileSync(
    path.join(destination, 'manifest.json'),
    JSON.stringify({ format: 'leaf.reader', version: 1, entries }),
  );
  return destination;
}

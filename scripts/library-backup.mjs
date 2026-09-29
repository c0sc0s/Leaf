import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const { openLibrary } = createRequire(import.meta.url)('../electron/storage/library.cjs');
const [command, source, target] = process.argv.slice(2);
if (!['backup', 'restore'].includes(command) || !source || !target)
  throw new Error(
    'Usage: node scripts/library-backup.mjs backup|restore SOURCE_DIRECTORY NEW_DESTINATION',
  );
if (!existsSync(path.join(source, 'library.sqlite'))) throw new Error('源书库不存在');
const destination = path.resolve(target);
if (existsSync(destination)) throw new Error('目标目录必须不存在，现有书库不会被覆盖');
if (command === 'backup') {
  const library = openLibrary(path.resolve(source));
  try {
    library.backup(destination);
  } finally {
    library.close();
  }
} else {
  const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('无效备份清单');
  const staging = `${destination}.restore-${randomUUID()}`;
  mkdirSync(staging, { recursive: true });
  try {
    cpSync(path.join(source, 'library.sqlite'), path.join(staging, 'library.sqlite'));
    mkdirSync(path.join(staging, 'content'));
    for (const entry of manifest.entries) {
      if (!/^[a-f0-9]{64}$/.test(entry.hash) || !Number.isSafeInteger(entry.size) || entry.size < 0)
        throw new Error('无效内容清单');
      const file = path.join(source, 'content', entry.hash);
      if (statSync(file).size !== entry.size) throw new Error('备份内容大小不匹配');
      cpSync(file, path.join(staging, 'content', entry.hash));
    }
    // Reopening checks migration history; making a verified snapshot checks references and hashes.
    const library = openLibrary(staging);
    const verification = `${staging}.verified`;
    try {
      library.backup(verification);
    } finally {
      library.close();
      rmSync(verification, { recursive: true, force: true });
    }
    renameSync(staging, destination);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
console.log(destination);

import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DesktopFile, DesktopFolder } from '@leaf/contracts/transport';

const maxBytes = 512 * 1024 * 1024;
export async function readDocument(file: string): Promise<DesktopFile> {
  const info = await stat(file);
  if (!info.isFile() || info.size > maxBytes) throw new Error('文件不可读或超过 512 MB');
  return { name: path.basename(file), data: new Uint8Array(await readFile(file)) };
}
export async function readFolder(root: string): Promise<DesktopFolder> {
  const files: DesktopFile[] = [];
  let bytes = 0;
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await walk(full);
      } else if (entry.isFile()) {
        bytes += (await stat(full)).size;
        if (bytes > maxBytes || files.length >= 10000)
          throw new Error('文件夹超过 512 MB 或 10000 个文件');
        files.push({
          name: path.relative(root, full).split(path.sep).join('/'),
          data: new Uint8Array(await readFile(full)),
        });
      }
    }
  };
  await walk(root);
  return { name: path.basename(root), files };
}

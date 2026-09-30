import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { DesktopFile, DesktopFolder } from './contract.ts';

const MAX_BYTES = 512 * 1024 * 1024;
export const isDocument = (file: string) => /\.(pdf|md|markdown)$/i.test(file);
const isBookResource = (file: string) =>
  /\.(md|markdown|png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file);

export async function readDocument(file: string): Promise<DesktopFile> {
  if (!isDocument(file)) throw new Error('请选择 PDF 或 Markdown 文件');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('请选择文件');
  if (info.size > MAX_BYTES) throw new Error('文件超过 512 MB，请使用较小文件');
  return { name: path.basename(file), data: new Uint8Array(await readFile(file)) };
}

export async function readFolder(root: string): Promise<DesktopFolder> {
  const files: DesktopFile[] = [];
  let bytes = 0;
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      // Never follow symbolic links outside the selected book.
      if (entry.isSymbolicLink()) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await walk(full);
      } else if (entry.isFile() && isBookResource(entry.name)) {
        bytes += (await stat(full)).size;
        if (bytes > MAX_BYTES) throw new Error('Markdown 书籍超过 512 MB，请使用较小文件夹');
        files.push({
          name: path.relative(root, full).split(path.sep).join('/'),
          data: new Uint8Array(await readFile(full)),
        });
      }
    }
  }
  await walk(root);
  if (!files.some((file) => /\.(md|markdown)$/i.test(file.name)))
    throw new Error('文件夹中没有 Markdown 文件（.md 或 .markdown）');
  return { name: path.basename(root), files };
}

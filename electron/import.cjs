const { readFile, stat, readdir } = require('node:fs/promises');
const path = require('node:path');
const MAX_BYTES = 512 * 1024 * 1024;
const isDocument = (file) => /\.(pdf|md|markdown)$/i.test(file);
const isBookResource = (file) => /\.(md|markdown|png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file);
async function readDocument(file) {
  if (!isDocument(file)) throw new Error('请选择 PDF 或 Markdown 文件');
  const info = await stat(file);
  if (!info.isFile()) throw new Error('请选择文件');
  if (info.size > MAX_BYTES) throw new Error('文件超过 512 MB，请使用较小文件');
  return { name: path.basename(file), data: new Uint8Array(await readFile(file)) };
}
async function readFolder(root) {
  const files = [];
  let bytes = 0;
  async function walk(directory) {
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
module.exports = { isDocument, readDocument, readFolder };

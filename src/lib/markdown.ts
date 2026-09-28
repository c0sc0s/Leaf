import type { Book, ImportFile, MarkdownChapter } from '../types';
import { fingerprint } from './db';

export const isMarkdown = (name: string) => /\.(md|markdown)$/i.test(name);
export const isMarkdownAsset = (name: string) => /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(name);
const natural = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const stripExtension = (name: string) => name.replace(/\.(md|markdown)$/i, '');

// Resolve paths within the imported book only, never against the machine's filesystem.
export function resolveBookLink(current: string, href: string) {
  if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) return null;
  const [pathname, hash = ''] = href.split('#');
  let decoded: string;
  let anchor: string;
  try {
    decoded = decodeURIComponent(pathname.split('?')[0]).replaceAll('\\', '/');
    anchor = decodeURIComponent(hash);
  } catch {
    return null;
  }
  const parts = decoded.startsWith('/') ? [] : current.split('/').slice(0, -1);
  if (!decoded) return { path: current, hash: anchor };
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return { path: parts.join('/'), hash: anchor };
}

function chapterTitle(content: string, path: string) {
  const heading = content.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1];
  return heading?.replace(/[*_`]/g, '').trim() || stripExtension(path.split('/').at(-1)!);
}

export async function importMarkdown(
  files: ImportFile[],
  name: string,
  folder = false,
): Promise<Book> {
  const selected = files.filter((file) => isMarkdown(file.name) || isMarkdownAsset(file.name));
  if (selected.reduce((size, file) => size + file.blob.size, 0) > 512 * 1024 * 1024)
    throw new Error('Markdown 书籍超过 512 MB，请使用较小文件夹');
  const ordered = selected
    .filter((file) => isMarkdown(file.name))
    .sort((a, b) => {
      const aReadme = /^readme\.(md|markdown)$/i.test(a.name);
      const bReadme = /^readme\.(md|markdown)$/i.test(b.name);
      return Number(bReadme) - Number(aReadme) || natural.compare(a.name, b.name);
    });
  if (!ordered.length) throw new Error('文件夹中没有 Markdown 文件（.md 或 .markdown）');
  const chapters: MarkdownChapter[] = await Promise.all(
    ordered.map(async (file) => {
      const content = (await file.blob.text()).replace(/^\uFEFF/, '');
      return {
        path: file.name.replaceAll('\\', '/'),
        title: chapterTitle(content, file.name),
        content,
      };
    }),
  );
  // Snapshot File bytes: browser file-backed Blobs can become unreadable if the source is removed.
  const assets = (
    await Promise.all(
      selected
        .filter((file) => isMarkdownAsset(file.name))
        .map(async (file) => ({
          path: file.name.replaceAll('\\', '/'),
          blob: new Blob([await file.blob.arrayBuffer()], { type: file.blob.type }),
        })),
    )
  ).sort((a, b) => natural.compare(a.path, b.path));
  // Hash paths and all content so changed images are not mistaken for an existing book.
  const identity = new Blob([
    JSON.stringify({
      format: 'markdown',
      folder,
      name: folder ? name : '',
      chapters,
      assets: assets.map((asset) => ({ path: asset.path, size: asset.blob.size })),
    }),
    ...assets.map((asset) => asset.blob),
  ]);
  const title = folder ? name : chapters[0].title;
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
    );
  const titleLines = Array.from(title)
    .slice(0, 36)
    .join('')
    .match(/.{1,12}/gu) || ['Markdown'];
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480"><rect width="360" height="480" fill="#e6ede5"/><path d="M45 55h270v370H45z" fill="#f7faf5"/><text x="72" y="120" font-family="sans-serif" font-size="18" fill="#54745a">MARKDOWN</text>${titleLines.map((line, index) => `<text x="72" y="${210 + index * 38}" font-family="sans-serif" font-size="24" fill="#283e2d">${escape(line)}</text>`).join('')}<text x="72" y="370" font-family="sans-serif" font-size="16" fill="#54745a">${chapters.length} CHAPTER${chapters.length > 1 ? 'S' : ''}</text></svg>`;
  return {
    id: 'md:' + (await fingerprint(await identity.arrayBuffer())),
    format: 'markdown',
    title,
    author: 'Markdown',
    filename: name,
    pages: chapters.length,
    blob: new Blob([JSON.stringify(chapters)], { type: 'application/json' }),
    chapters,
    assets,
    cover: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cover),
    addedAt: Date.now(),
    openedAt: 0,
    page: 1,
    favorite: false,
  };
}

export function browserFolder(files: File[]) {
  const root = files[0]?.webkitRelativePath.split('/')[0] || 'Markdown';
  return {
    name: root,
    folder: true,
    files: files
      .map((file) => ({
        name: file.webkitRelativePath.split('/').slice(1).join('/') || file.name,
        blob: file,
      }))
      .filter(
        (file) =>
          (isMarkdown(file.name) || isMarkdownAsset(file.name)) &&
          file.name
            .split('/')
            .slice(0, -1)
            .every((part) => !part.startsWith('.') && part !== 'node_modules'),
      ),
  };
}

// Capture entries synchronously: browsers clear DataTransfer after the drop handler returns.
export async function droppedSources(data: DataTransfer) {
  const entries = [...data.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry());
  const fallback = [...data.files];
  if (!entries.length || entries.some((entry) => !entry))
    return fallback.map((file) => ({ name: file.name, files: [{ name: file.name, blob: file }] }));
  async function walk(entry: FileSystemEntry, prefix = ''): Promise<ImportFile[]> {
    if (entry.isFile) {
      if (!isMarkdown(entry.name) && !isMarkdownAsset(entry.name)) return [];
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      return [{ name: prefix + entry.name, blob: file }];
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const files: ImportFile[] = [];
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!batch.length) break;
      for (const child of batch) {
        if (child.isDirectory && (child.name.startsWith('.') || child.name === 'node_modules'))
          continue;
        files.push(...(await walk(child, child.isDirectory ? prefix + child.name + '/' : prefix)));
      }
    }
    return files;
  }
  return Promise.all(
    entries.map(async (entry) => {
      if (entry!.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject),
        );
        return { name: entry!.name, files: [{ name: entry!.name, blob: file }] };
      }
      return { name: entry!.name, folder: true, files: await walk(entry!) };
    }),
  );
}

import type { DocumentDraft, ImportSource } from '@leaf/contracts/documents';

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

export function importMarkdown(source: ImportSource): DocumentDraft {
  const selected = source.files.filter(
    (file) => isMarkdown(file.name) || isMarkdownAsset(file.name),
  );
  const ordered = selected
    .filter((file) => isMarkdown(file.name))
    .sort(
      (a, b) =>
        Number(/^readme\.(md|markdown)$/i.test(b.name)) -
          Number(/^readme\.(md|markdown)$/i.test(a.name)) || natural.compare(a.name, b.name),
    );
  if (!ordered.length) throw new Error('文件夹中没有 Markdown 文件');
  const chapters = ordered.map((file) => ({
    path: source.folder ? file.name : 'document.md',
    title: chapterTitle(new TextDecoder().decode(file.data).replace(/^\uFEFF/, ''), file.name),
  }));
  const title = source.folder ? source.name : chapters[0].title;
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
    );
  const lines = Array.from(title)
    .slice(0, 36)
    .join('')
    .match(/.{1,12}/gu) || ['Markdown'];
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480"><rect width="360" height="480" fill="#e6ede5"/><path d="M45 55h270v370H45z" fill="#f7faf5"/><text x="72" y="120" font-family="sans-serif" font-size="18" fill="#54745a">MARKDOWN</text>${lines.map((line, index) => `<text x="72" y="${210 + index * 38}" font-family="sans-serif" font-size="24" fill="#283e2d">${escape(line)}</text>`).join('')}<text x="72" y="370" font-family="sans-serif" font-size="16" fill="#54745a">${chapters.length} CHAPTER${chapters.length > 1 ? 'S' : ''}</text></svg>`;
  const files = source.folder ? selected : [{ ...ordered[0], name: 'document.md' }];
  return {
    formatId: 'markdown',
    title,
    author: 'Markdown',
    filename: source.name,
    cover: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(cover),
    files,
    data: { chapters },
    progress: { fraction: 0, label: `1 / ${chapters.length}`, ordinal: 1, total: chapters.length },
  };
}

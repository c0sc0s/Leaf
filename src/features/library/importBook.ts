import type { Book, ImportSource } from '../../types';
import { importMarkdown, isMarkdown } from '../../lib/markdown';

export async function importBook(
  source: ImportSource,
  askPassword: () => Promise<string | null>,
): Promise<Book | null> {
  if (!source.folder && !/\.(pdf|md|markdown)$/i.test(source.name))
    throw new Error('支持 PDF、Markdown 文件或 Markdown 文件夹');
  if (!source.files.length) throw new Error('没有可导入的文件');
  if (source.files.reduce((size, file) => size + file.blob.size, 0) > 512 * 1024 * 1024)
    throw new Error('书籍超过 512 MB，请使用较小文件或文件夹');
  if (source.folder || isMarkdown(source.name))
    return importMarkdown(source.files, source.name, source.folder);
  const { importPDF } = await import('../../lib/pdf');
  try {
    return await importPDF(source.files[0].blob, source.name);
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'PasswordException') throw error;
    const password = await askPassword();
    return password === null ? null : importPDF(source.files[0].blob, source.name, password);
  }
}

import { useCallback, useState } from 'react';
import type { Annotation, Book } from '../../../types';

/** Exporting pulls in pdf-lib, so the module loads only when an export is requested. */
export function useExports(
  book: Book,
  flushMarks: () => Promise<Annotation[]>,
  notify: (message: string) => void,
) {
  const [exporting, setExporting] = useState(false);
  const exportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const { exportAnnotated, saveFile } = await import('../../../lib/export');
      const data = await exportAnnotated(book.blob, await flushMarks());
      if (await saveFile(book.filename.replace(/\.pdf$/i, '') + '-批注.pdf', data))
        notify('批注 PDF 已导出');
    } catch (error) {
      notify('无法导出：加密 PDF 需先解除文件保护。' + String(error));
    } finally {
      setExporting(false);
    }
  }, [book.blob, book.filename, flushMarks, notify]);
  const exportNotes = useCallback(async () => {
    try {
      const { notesMarkdown, saveFile } = await import('../../../lib/export');
      const markdown = notesMarkdown(book.title, await flushMarks());
      if (
        await saveFile(book.title + '-笔记.md', new TextEncoder().encode(markdown), 'text/markdown')
      )
        notify('阅读笔记已导出');
    } catch (error) {
      notify('无法导出笔记：' + String(error));
    }
  }, [book.title, flushMarks, notify]);
  return { exporting, exportPDF, exportNotes };
}

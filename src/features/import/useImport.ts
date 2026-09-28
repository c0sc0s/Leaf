import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Book } from '../../types';
import { storage } from '../../lib/db';

const MAX_FILE_SIZE = 512 * 1024 * 1024;

export interface ImportFile {
  name: string;
  blob: Blob;
}

const fromDesktop = (file: { name: string; data: Uint8Array }): ImportFile => ({
  name: file.name,
  blob: new Blob([file.data.slice().buffer], { type: 'application/pdf' }),
});

interface Options {
  addBook: (book: Book, file: Blob) => Promise<void>;
  askPassword: () => Promise<string | null>;
  notify: (message: string) => void;
  onImported: () => void;
}

/**
 * The import pipeline: validation, password retry, duplicate detection and storage.
 * Also listens to every entry point that can start an import (menu, shortcut, OS file open).
 */
export function useImport({ addBook, askPassword, notify, onImported }: Options) {
  const [busy, setBusy] = useState<string | null>(null);
  const importing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const importOne = useCallback(
    async (file: ImportFile) => {
      if (!/\.pdf$/i.test(file.name)) {
        notify('只支持 PDF 文件');
        return false;
      }
      if (file.blob.size > MAX_FILE_SIZE) {
        notify('文件超过 512 MB，请使用较小的 PDF');
        return false;
      }
      const { importPDF } = await import('../../lib/pdf');
      let book: Book;
      try {
        book = await importPDF(file.blob, file.name);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'PasswordException')) throw error;
        const password = await askPassword();
        if (password === null) return false;
        book = await importPDF(file.blob, file.name, password);
      }
      if (await storage.hasBook(book.id)) {
        notify(`${book.title} 已在书库中`);
        return false;
      }
      await addBook(book, file.blob);
      return true;
    },
    [addBook, askPassword, notify],
  );

  const importFiles = useCallback(
    async (files: ImportFile[]) => {
      if (importing.current) return;
      importing.current = true;
      let added = 0;
      try {
        for (const file of files) {
          setBusy(`正在导入 ${file.name}`);
          try {
            if (await importOne(file)) added++;
          } catch (error) {
            notify(
              `「${file.name}」导入失败：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        if (added) {
          onImported();
          notify(`已把 ${added} 本新书收入书架`);
        }
      } finally {
        setBusy(null);
        importing.current = false;
      }
    },
    [importOne, notify, onImported],
  );

  const openImport = useCallback(() => {
    if (importing.current) return;
    if (!window.desktop) return fileInput.current?.click();
    void window.desktop
      .openPDF()
      .then((files) => files && importFiles(files.map(fromDesktop)))
      .catch((error) => notify(`无法打开文件：${String(error)}`));
  }, [importFiles, notify]);

  useEffect(() => {
    const menu = () => openImport();
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'o') {
        event.preventDefault();
        openImport();
      }
    };
    window.addEventListener('leaf:open', menu);
    window.addEventListener('keydown', shortcut);
    const stop = window.desktop?.onOpenFile((file) => void importFiles([fromDesktop(file)]));
    window.desktop?.ready();
    return () => {
      window.removeEventListener('leaf:open', menu);
      window.removeEventListener('keydown', shortcut);
      stop?.();
    };
  }, [openImport, importFiles]);

  const fileInputProps = {
    ref: fileInput,
    className: 'visually-hidden',
    'aria-label': '选择 PDF 文件',
    type: 'file',
    accept: '.pdf,application/pdf',
    multiple: true,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const files = [...(event.target.files ?? [])].map((file) => ({
        name: file.name,
        blob: file,
      }));
      event.target.value = '';
      void importFiles(files);
    },
  } as const;

  return { busy, importFiles, openImport, fileInputProps };
}

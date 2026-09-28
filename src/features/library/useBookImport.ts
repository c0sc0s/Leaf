import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book, ImportSource } from '../../types';
import { storage } from '../../lib/db';
import { SerialQueue } from '../../lib/serialQueue';
import { importBook } from './importBook';

export function useBookImport({
  addBook,
  onImported,
  askPassword,
  notify,
}: {
  addBook: (book: Book) => Promise<void>;
  onImported: () => void;
  askPassword: () => Promise<string | null>;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [queue] = useState(() => new SerialQueue());
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dialogOpen = useRef(false);

  const importFiles = useCallback(
    (sources: ImportSource[]) =>
      queue.enqueue(async () => {
        let added = 0;
        try {
          for (const source of sources) {
            setBusy(`正在导入 ${source.name}`);
            try {
              const book = await importBook(source, askPassword);
              if (!book) continue;
              const existing = await storage.metadata(book.id);
              if (existing) {
                notify(`${existing.title} 已在书库中`);
                continue;
              }
              await addBook(book);
              added++;
            } catch (error) {
              notify(
                `「${source.name}」导入失败：${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
          if (added) {
            onImported();
            notify(`已把 ${added} 本新书收入书架`);
          }
        } finally {
          setBusy(null);
        }
      }),
    [queue, addBook, onImported, askPassword, notify],
  );

  const openImport = useCallback(() => {
    if (!window.desktop) {
      fileInput.current?.click();
      return;
    }
    if (dialogOpen.current) return;
    dialogOpen.current = true;
    void window.desktop
      .openPDF()
      .then((files) => {
        if (files)
          void importFiles(
            files.map((file) => ({
              name: file.name,
              files: [{ name: file.name, blob: new Blob([file.data.slice().buffer]) }],
            })),
          );
      })
      .catch((error) => notify('无法打开文件：' + String(error)))
      .finally(() => {
        dialogOpen.current = false;
      });
  }, [importFiles, notify]);

  const openFolderImport = useCallback(() => {
    if (!window.desktop) {
      folderInput.current?.click();
      return;
    }
    if (dialogOpen.current) return;
    dialogOpen.current = true;
    void window.desktop
      .openFolder()
      .then((folder) => {
        if (folder)
          void importFiles([
            {
              name: folder.name,
              folder: true,
              files: folder.files.map((file) => ({
                name: file.name,
                blob: new Blob([file.data.slice().buffer]),
              })),
            },
          ]);
      })
      .catch((error) => notify('无法导入文件夹：' + String(error)))
      .finally(() => {
        dialogOpen.current = false;
      });
  }, [importFiles, notify]);

  useEffect(() => {
    const event = () => openImport();
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'o') {
        event.preventDefault();
        openImport();
      }
    };
    window.addEventListener('leaf:open', event);
    window.addEventListener('leaf:open-folder', openFolderImport);
    window.addEventListener('keydown', shortcut);
    const stop = window.desktop?.onOpenFile((file) => {
      void importFiles([
        {
          name: file.name,
          files: [{ name: file.name, blob: new Blob([file.data.slice().buffer]) }],
        },
      ]);
    });
    window.desktop?.ready();
    return () => {
      window.removeEventListener('leaf:open', event);
      window.removeEventListener('leaf:open-folder', openFolderImport);
      window.removeEventListener('keydown', shortcut);
      stop?.();
    };
  }, [openImport, openFolderImport, importFiles]);

  return { busy, fileInput, folderInput, importFiles, openImport, openFolderImport };
}

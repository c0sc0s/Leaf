import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { NotFound } from '@/components/Mascot';
import { WindowControls } from '@/components/WindowControls';
import { AppBrand } from '@/components/AppBrand';
import { Button } from '@/components/ui/button';
import { Upload, X } from '@/components/icons';
import { useAppRoute } from '@/lib/useAppRoute';
import type { BookMetadata } from './types';
import { browserFolder } from './lib/markdown';
import { frostedPanel, pop, rise, scrim } from './lib/motion';
import { Exiting, Spinner } from './components/UI';
import { usePasswordPrompt } from './components/PasswordDialog';
import { useToast } from './components/useToast';
import { Library, type LibraryView } from './features/library/Library';
import { LibrarySidebar } from './features/library/LibrarySidebar';
import { DeleteBookDialog } from './features/library/DeleteBookDialog';
import { openingLabel, useLibrary } from './features/library/useLibrary';
import { useReaderReveal } from './features/reader/useReaderReveal';
import { useBookImport } from './features/library/useBookImport';
import { useFileDrop } from './features/import/useFileDrop';
import { AboutDialog } from './features/about/AboutDialog';
import { SettingsModal } from './features/settings/SettingsModal';
import { useSettings } from './features/settings/useSettings';
import { BookReader, preloadReadersWhenIdle } from './features/reader/BookReader';

/** The opening overlay stays up at least this long, so a fast open does not flash. */
const OPENING_MIN_MS = 500;

const platformClass =
  window.desktop?.platform === 'darwin'
    ? 'native-mac'
    : window.desktop?.platform === 'win32'
      ? 'native-win'
      : '';

export default function App({ startupNotice }: { startupNotice?: string }) {
  const route = useAppRoute();
  const toast = useToast();
  const { notify } = toast;
  useEffect(() => {
    if (startupNotice) notify(startupNotice);
  }, [startupNotice, notify]);
  useEffect(() => {
    const failed = () => notify('本地存储操作失败，请重试');
    window.addEventListener('leaf:storage-error', failed);
    return () => window.removeEventListener('leaf:storage-error', failed);
  }, [notify]);
  const { settings, setSettings, dark, toggleTheme } = useSettings();
  const library = useLibrary(notify);
  const password = usePasswordPrompt();
  const [view, setView] = useState<LibraryView>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [deleting, setDeleting] = useState<BookMetadata | null>(null);
  const showAllBooks = useCallback(() => setView('all'), []);
  const imports = useBookImport({
    addBook: library.addBook,
    askPassword: password.ask,
    notify,
    onImported: showAllBooks,
  });
  const { dragging, dropProps } = useFileDrop(imports.importFiles, notify);
  const { active, closeReader } = library;
  const reader = useReaderReveal(active, library.openingId, OPENING_MIN_MS);
  const opening = reader.openingId
    ? (library.books.find((book) => book.id === reader.openingId) ?? active)
    : null;
  const busy = imports.busy ?? (opening ? openingLabel(opening.title) : null);
  useEffect(() => {
    if (!library.loading) return preloadReadersWhenIdle();
  }, [library.loading]);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const navigate = (next: LibraryView) => {
    if (route.notFound) route.home();
    closeReader();
    setView(next);
  };
  const confirmDelete = async (book: BookMetadata) => {
    if (await library.removeBook(book.id)) setDeleting(null);
  };

  return (
    <div className="app-shell" {...dropProps}>
      {(!reader.shown || route.notFound) && (
        <div className={`titlebar ${platformClass}`}>
          {route.notFound && <AppBrand onClick={() => navigate('all')} />}
        </div>
      )}
      <div className="app-body">
        {route.notFound ? (
          <NotFound
            onHome={() => navigate('all')}
            onBack={route.canReturn ? () => history.back() : undefined}
          />
        ) : (
          <>
            {active && (
              <div ref={reader.stage} className={`reader-stage ${reader.shown ? '' : 'pending'}`}>
                <BookReader
                  key={active.id}
                  book={active}
                  settings={settings}
                  dark={dark}
                  onClose={closeReader}
                  onUpdate={library.updateBook}
                  onSettings={openSettings}
                  notify={notify}
                  askPassword={password.ask}
                />
              </div>
            )}
            {!reader.shown && (
              <>
                <LibrarySidebar
                  view={view}
                  books={library.books}
                  noteCounts={library.counts}
                  dark={dark}
                  onView={setView}
                  onToggleTheme={toggleTheme}
                  onSettings={openSettings}
                  onAbout={() => setAboutOpen(true)}
                />
                <main className="library-main">
                  {library.loading ? (
                    <Spinner text="正在整理你的书架…" />
                  ) : (
                    <Library
                      books={library.books}
                      view={view}
                      noteCounts={library.counts}
                      onImport={imports.openImport}
                      onImportFolder={imports.openFolderImport}
                      onOpen={library.openBook}
                      onPrefetch={library.prefetchBook}
                      onUpdate={library.updateBook}
                      onDelete={setDeleting}
                      onBrowse={showAllBooks}
                    />
                  )}
                </main>
              </>
            )}
          </>
        )}
      </div>
      <input
        className="visually-hidden"
        aria-label="选择 PDF 或 Markdown 文件"
        type="file"
        accept=".pdf,.md,.markdown,application/pdf,text/markdown"
        multiple
        ref={imports.fileInput}
        onChange={(event) => {
          if (event.target.files)
            void imports.importFiles(
              [...event.target.files].map((file) => ({
                name: file.name,
                files: [{ name: file.name, blob: file }],
              })),
            );
          event.target.value = '';
        }}
      />
      <input
        className="visually-hidden"
        aria-label="选择 Markdown 文件夹"
        type="file"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        ref={imports.folderInput}
        onChange={(event) => {
          if (event.target.files?.length)
            void imports.importFiles([browserFolder([...event.target.files])]);
          event.target.value = '';
        }}
      />
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {deleting && (
        <DeleteBookDialog
          book={deleting}
          onConfirm={() => void confirmDelete(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {password.dialog}
      <AnimatePresence>
        {busy && (
          <Exiting key="busy">
            <m.div className="busy-overlay" {...scrim}>
              <m.div className="busy-panel" {...frostedPanel}>
                <Spinner text={busy} size={48} />
              </m.div>
            </m.div>
          </Exiting>
        )}
        {dragging && (
          <Exiting key="drop">
            <m.div className="drop-overlay" {...pop}>
              <div>
                <Upload size={44} />
                <h2>把新书放在这里</h2>
                <p>松开鼠标，将 PDF、Markdown 文件或文件夹收入书架</p>
              </div>
            </m.div>
          </Exiting>
        )}
        {toast.message && (
          <Exiting key="toast">
            <m.div className="toast" role="status" layout {...rise}>
              <span>{toast.message}</span>
              <Button variant="ghost" aria-label="关闭通知" onClick={toast.dismiss}>
                <X size={14} />
              </Button>
            </m.div>
          </Exiting>
        )}
      </AnimatePresence>
      <WindowControls />
    </div>
  );
}

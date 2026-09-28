import { lazy, Suspense, useCallback, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { NotFound } from '@/components/Mascot';
import { Button } from '@/components/ui/button';
import { Upload, X } from '@/components/icons';
import { useAppRoute } from '@/lib/useAppRoute';
import type { Book } from './types';
import { fade, pop, rise } from './lib/motion';
import { Exiting, Spinner } from './components/UI';
import { usePasswordPrompt } from './components/PasswordDialog';
import { useToast } from './components/useToast';
import { Library, type LibraryView } from './features/library/Library';
import { LibrarySidebar } from './features/library/LibrarySidebar';
import { DeleteBookDialog } from './features/library/DeleteBookDialog';
import { useLibrary } from './features/library/useLibrary';
import { useImport } from './features/import/useImport';
import { useFileDrop } from './features/import/useFileDrop';
import { AboutDialog } from './features/about/AboutDialog';
import { SettingsModal } from './features/settings/SettingsModal';
import { useSettings } from './features/settings/useSettings';

// The reader pulls in pdf.js; the library opens without it.
const Reader = lazy(() => import('./features/reader/Reader').then((m) => ({ default: m.Reader })));

const platformClass =
  window.desktop?.platform === 'darwin'
    ? 'native-mac'
    : window.desktop?.platform === 'win32'
      ? 'native-win'
      : '';

export default function App() {
  const route = useAppRoute();
  const toast = useToast();
  const { notify } = toast;
  const { settings, setSettings, dark, toggleTheme } = useSettings();
  const library = useLibrary(notify);
  const password = usePasswordPrompt();
  const [view, setView] = useState<LibraryView>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [deleting, setDeleting] = useState<Book | null>(null);
  const showAllBooks = useCallback(() => setView('all'), []);
  const imports = useImport({
    addBook: library.addBook,
    askPassword: password.ask,
    notify,
    onImported: showAllBooks,
  });
  const { dragging, dropProps } = useFileDrop((files) =>
    imports.importFiles(files.map((file) => ({ name: file.name, blob: file }))),
  );
  const active = activeId ? library.books.find((book) => book.id === activeId) : undefined;
  const { refreshNoteCounts } = library;
  const closeReader = useCallback(() => {
    setActiveId(null);
    refreshNoteCounts();
  }, [refreshNoteCounts]);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const navigate = (next: LibraryView) => {
    if (route.notFound) route.home();
    if (active) closeReader();
    setView(next);
  };
  const confirmDelete = async (book: Book) => {
    try {
      await library.removeBook(book);
      notify('已从书库移除');
      setDeleting(null);
      refreshNoteCounts();
    } catch (error) {
      notify(`无法移除这本书：${String(error)}`);
    }
  };

  return (
    <div className="app-shell" {...dropProps}>
      {(!active || route.notFound) && (
        <div className={`titlebar ${platformClass}`}>
          <Button
            variant="ghost"
            className="app-brand"
            aria-label="Leaf 我的书架"
            onClick={() => navigate('all')}
          >
            <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" width="24" height="24" />
            <span>Leaf</span>
          </Button>
        </div>
      )}
      <div className="app-body">
        {route.notFound ? (
          <NotFound
            onHome={() => navigate('all')}
            onBack={route.canReturn ? () => history.back() : undefined}
          />
        ) : active ? (
          <Suspense fallback={<Spinner text="正在打开 PDF…" />}>
            <Reader
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
          </Suspense>
        ) : (
          <>
            <LibrarySidebar
              view={view}
              books={library.books}
              noteCounts={library.noteCounts}
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
                  noteCounts={library.noteCounts}
                  onImport={imports.openImport}
                  onOpen={(book) => setActiveId(book.id)}
                  onUpdate={library.updateBook}
                  onDelete={setDeleting}
                  onBrowse={showAllBooks}
                />
              )}
            </main>
          </>
        )}
      </div>
      <input {...imports.fileInputProps} />
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
        {imports.busy && (
          <Exiting key="busy">
            <m.div className="busy-overlay" {...fade}>
              <Spinner text={imports.busy} />
            </m.div>
          </Exiting>
        )}
        {dragging && (
          <Exiting key="drop">
            <m.div className="drop-overlay" {...pop}>
              <div>
                <Upload size={44} />
                <h2>把新书放在这里</h2>
                <p>松开鼠标，将 PDF 收入你的书架</p>
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
    </div>
  );
}

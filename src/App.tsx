import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { NotFound } from '@/components/Mascot';
import { WindowControls } from '@/components/WindowControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BookOpen,
  Heart,
  Clock3,
  NotebookPen,
  Sun,
  Moon,
  Settings2,
  Upload,
  X,
  LockKeyhole,
} from '@/components/icons';
import type { BookMetadata } from './types';
import { fade, pop, rise } from './lib/motion';
import { useAppRoute } from './lib/useAppRoute';
import { browserFolder, droppedSources } from './lib/markdown';
import { Library, type LibraryView } from './features/library/Library';
import { useLibrary } from './features/library/useLibrary';
import { useBookImport } from './features/library/useBookImport';
import { BookReader } from './features/reader/BookReader';
import { Exiting, IconButton, Modal, Spinner } from './components/UI';
import { SettingsModal } from './features/settings/SettingsModal';
import { useSettings } from './features/settings/useSettings';
import { AboutDialog } from './app/AboutDialog';
import { useNotifications } from './app/useNotifications';
import { usePasswordPrompt } from './app/usePasswordPrompt';

export default function App() {
  const route = useAppRoute();
  const { toast, notify, clearToast } = useNotifications();
  const { settings, setSettings, dark } = useSettings();
  const { password, passwordValue, setPasswordValue, askPassword, finishPassword } =
    usePasswordPrompt();
  const {
    books,
    active,
    loading,
    opening,
    counts,
    openBook,
    closeReader,
    updateBook,
    addBook,
    removeBook,
  } = useLibrary(notify);
  const [view, setView] = useState<LibraryView>('all');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<BookMetadata | null>(null);
  const dragDepth = useRef(0);
  const onImported = useCallback(() => setView('all'), []);
  const {
    busy: importBusy,
    fileInput,
    folderInput,
    importFiles,
    openImport,
    openFolderImport,
  } = useBookImport({ addBook, onImported, askPassword, notify });
  const busy = importBusy || opening;
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  async function deleteBook() {
    if (deleting && (await removeBook(deleting.id))) setDeleting(null);
  }
  const nav = (next: LibraryView) => {
    if (route.notFound) route.home();
    closeReader();
    setView(next);
  };
  return (
    <div
      className="app-shell"
      onDragEnter={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current--;
        if (dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void droppedSources(e.dataTransfer)
          .then(importFiles)
          .catch((error) => notify('无法导入：' + String(error)));
      }}
    >
      {(!active || route.notFound) && (
        <div
          className={`titlebar ${window.desktop?.platform === 'darwin' ? 'native-mac' : window.desktop?.platform === 'win32' ? 'native-win' : ''}`}
        >
          <Button
            variant="ghost"
            className="app-brand"
            aria-label="Leaf 我的书架"
            onClick={() => nav('all')}
          >
            <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" width="24" height="24" />
            <span>Leaf</span>
          </Button>
        </div>
      )}
      <div className="app-body">
        {route.notFound ? (
          <NotFound
            onHome={() => nav('all')}
            onBack={route.canReturn ? () => history.back() : undefined}
          />
        ) : active ? (
          <BookReader
            key={active.id}
            book={active}
            settings={settings}
            dark={dark}
            onClose={closeReader}
            onUpdate={updateBook}
            onSettings={openSettings}
            notify={notify}
            askPassword={askPassword}
          />
        ) : (
          <>
            <aside className="library-sidebar">
              <div className="sidebar-section-label">书库</div>
              <div className="sidebar-navigation" role="navigation" aria-label="书库导航">
                {(
                  [
                    ['all', '我的书架', BookOpen],
                    ['recent', '最近阅读', Clock3],
                    ['favorites', '收藏', Heart],
                    ['notes', '阅读笔记', NotebookPen],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <Button
                    variant="ghost"
                    className={view === v ? 'selected' : ''}
                    aria-current={view === v ? 'page' : undefined}
                    key={v}
                    onClick={() => setView(v)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    <Badge variant="secondary" className="ml-auto text-[11px]">
                      {v === 'all'
                        ? books.length
                        : v === 'favorites'
                          ? books.filter((b) => b.favorite).length
                          : v === 'notes'
                            ? Object.values(counts).reduce((n, c) => n + c, 0)
                            : books.filter((b) => b.openedAt > 0).length}
                    </Badge>
                  </Button>
                ))}
              </div>
              <div className="sidebar-footer">
                <Button variant="ghost" className="about-link" onClick={() => setAbout(true)}>
                  关于 Leaf
                </Button>
                <IconButton
                  label={dark ? '切换浅色模式' : '切换深色模式'}
                  onClick={() => setSettings((s) => ({ ...s, theme: dark ? 'light' : 'dark' }))}
                >
                  {dark ? <Sun size={16} /> : <Moon size={16} />}
                </IconButton>
                <IconButton label="设置" onClick={openSettings}>
                  <Settings2 size={16} />
                </IconButton>
              </div>
            </aside>
            <main className="library-main">
              {loading ? (
                <Spinner text="正在整理你的书架…" />
              ) : (
                <Library
                  books={books}
                  view={view}
                  noteCounts={counts}
                  onImport={openImport}
                  onImportFolder={openFolderImport}
                  onOpen={openBook}
                  onUpdate={updateBook}
                  onDelete={setDeleting}
                  onBrowse={() => setView('all')}
                />
              )}
            </main>
          </>
        )}
      </div>
      <input
        className="visually-hidden"
        aria-label="选择 PDF 或 Markdown 文件"
        type="file"
        accept=".pdf,.md,.markdown,application/pdf,text/markdown"
        multiple
        ref={fileInput}
        onChange={(e) => {
          if (e.target.files)
            void importFiles(
              [...e.target.files].map((file) => ({
                name: file.name,
                files: [{ name: file.name, blob: file }],
              })),
            );
          e.target.value = '';
        }}
      />
      <input
        className="visually-hidden"
        aria-label="选择 Markdown 文件夹"
        type="file"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        ref={folderInput}
        onChange={(e) => {
          if (e.target.files?.length) void importFiles([browserFolder([...e.target.files])]);
          e.target.value = '';
        }}
      />
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {deleting && (
        <Modal title="移除这本书？" onClose={() => setDeleting(null)}>
          <p>将从本机书库移除「{deleting.title}」及其批注。你导入前的原始文件不受影响。</p>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              保留
            </Button>
            <Button variant="destructive" onClick={() => void deleteBook()}>
              移除书籍和批注
            </Button>
          </div>
        </Modal>
      )}
      {password !== null && (
        <Modal title="打开受保护的 PDF" onClose={() => finishPassword(null)}>
          <p className="muted">
            <LockKeyhole size={16} /> {password}，请输入打开密码。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              finishPassword(passwordValue);
            }}
          >
            <Input
              autoFocus
              className="password-input"
              type="password"
              aria-label="PDF 密码"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="文件打开密码"
            />
            <p className="small muted">密码仅在本次打开时使用，不会写入书库。</p>
            <div className="modal-actions">
              <Button variant="outline" type="button" onClick={() => finishPassword(null)}>
                取消
              </Button>
              <Button variant="default" type="submit">
                打开 PDF
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <AnimatePresence>
        {busy && (
          <Exiting key="busy">
            <m.div className="busy-overlay" {...fade}>
              <Spinner text={busy} />
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
        {toast && (
          <Exiting key="toast">
            <m.div className="toast" role="status" layout {...rise}>
              <span>{toast}</span>
              <Button variant="ghost" aria-label="关闭通知" onClick={clearToast}>
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

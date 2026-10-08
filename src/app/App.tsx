import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { useStore } from '@leaf/plugin-sdk/react';
import type { DocumentMetadata, ImportSource } from '@leaf/contracts/documents';
import { Button } from '@leaf/ui/primitives/button';
import { Upload, X } from '@leaf/ui/icons';
import { Exiting, Spinner } from '@leaf/ui/primitives/composition';
import { frostedPanel, rise, scrim } from '@leaf/ui/motion';
import type { AppServices } from './compose';
import { Library, type LibraryView } from './library/Library';
import { LibrarySidebar } from './library/LibrarySidebar';
import { DeleteBookDialog } from './library/DeleteBookDialog';
import { AboutDialog } from './about/AboutDialog';
import { UpdateNotice } from './about/UpdatePanel';
import { SettingsModal } from './settings/SettingsModal';
import { WindowControls } from './components/WindowControls';
import { InteractionDialog } from './components/InteractionDialog';
import { NotFound } from './components/Mascot';
import { AppBrand } from './components/AppBrand';
import { ReaderShell } from './reader/ReaderShell';
import { useAppRoute } from './routes/useAppRoute';
import { useFileDrop } from './import/useFileDrop';
import { fileSources, folderSource } from '../platform/files/browser';
import { applyGlassAppearance } from '../platform/appearance';
import { useToast } from './components/useToast';
import type { ReadingSession } from '../core/reader/session';
import type { ReadingAppearance } from '@leaf/contracts/reader';

export default function App({ services }: { services: AppServices }) {
  const route = useAppRoute(),
    library = useStore(services.library.state),
    reader = useStore(services.reader.state),
    settings = useStore(services.settings.state),
    message = useStore(services.notices);
  const revision = useStore(services.registry.revision);
  const toast = useToast(),
    notify = services.notify;
  const toastNotify = toast.notify;
  useEffect(() => {
    if (message) {
      toastNotify(message);
      services.notices.set(null);
    }
  }, [message, services, toastNotify]);
  const [view, setView] = useState<LibraryView>('all'),
    [settingsOpen, setSettingsOpen] = useState(false),
    [aboutOpen, setAboutOpen] = useState(false),
    [deleting, setDeleting] = useState<DocumentMetadata | null>(null),
    [shownId, setShownId] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const appearance = useMemo<ReadingAppearance>(
    () => ({
      theme:
        settings.readerTheme === 'dark' || (settings.readerTheme === 'follow' && dark)
          ? 'dark'
          : 'light',
      originalColors: settings.originalColors,
    }),
    [settings.readerTheme, settings.originalColors, dark],
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)'),
      change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
    applyGlassAppearance(settings);
    window.desktop?.setTheme(settings.theme);
    window.desktop?.setFrostedGlass(settings.frostedGlass);
  }, [dark, settings]);
  const report = useCallback(
    (error: unknown) => notify(error instanceof Error ? error.message : String(error)),
    [notify],
  );
  const changeSettings = useCallback(
    (value: typeof settings) => {
      void services.persistence
        .track(services.settings.update(value), 'setting:appearance')
        .catch(report);
    },
    [services, report],
  );
  const fileInput = useRef<HTMLInputElement>(null),
    folderInput = useRef<HTMLInputElement>(null);
  // Registration changes mutate the registry without replacing its identity.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const formats = useMemo(() => services.documents.formats(), [services, revision]),
    extensions = useMemo(
      () => [...new Set(formats.flatMap((format) => format.extensions))],
      [formats],
    ),
    folders = formats.some((format) => format.folders);
  const importing = useCallback(
    async (sources: ImportSource[]) => {
      try {
        const result = await services.library.import(sources);
        if (result.added.length) setView('all');
        if (result.failures.length)
          notify(result.failures.map((entry) => `${entry.name}：${entry.message}`).join('\n'));
        else if (result.duplicates.length) notify('文档已在书库中');
      } catch (error) {
        report(error);
      }
    },
    [services, notify, report],
  );
  const openImport = useCallback(() => {
    if (window.desktop)
      void window.desktop
        .openDocuments(extensions)
        .then(
          (files) => files && importing(files.map((file) => ({ name: file.name, files: [file] }))),
        )
        .catch(report);
    else fileInput.current?.click();
  }, [extensions, importing, report]);
  const openFolder = useCallback(() => {
    if (!folders) return notify('请安装支持文件夹的阅读插件');
    if (window.desktop)
      void window.desktop
        .openFolder()
        .then((folder) => folder && importing([{ ...folder, folder: true }]))
        .catch(report);
    else folderInput.current?.click();
  }, [folders, importing, notify, report]);
  const { dragging, dropProps } = useFileDrop(importing, notify);
  useEffect(() => {
    const open = () => openImport(),
      folder = () => openFolder();
    window.addEventListener('leaf:open', open);
    window.addEventListener('leaf:open-folder', folder);
    const unsubscribe = window.desktop?.onOpenFile((file) => {
      void importing([{ name: file.name, files: [file] }]);
    });
    window.desktop?.ready();
    return () => {
      window.removeEventListener('leaf:open', open);
      window.removeEventListener('leaf:open-folder', folder);
      unsubscribe?.();
    };
  }, [openImport, openFolder, importing]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault();
        openImport();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [openImport]);
  useEffect(() => {
    if (import.meta.env.VITE_LEAF_SEED_SAMPLES)
      void import('./library/seedSamples')
        .then((module) => module.seedSamples(services))
        .catch(report);
  }, [services, report]);
  const open = useCallback(
    (book: DocumentMetadata) => {
      setShownId(null);
      void services
        .flush()
        .then(() => services.reader.open(book.id))
        .catch(report);
    },
    [services, report],
  );
  const close = useCallback(() => {
    void (async () => {
      await services.flush();
      await services.reader.close();
      setShownId(null);
      await services.library.refreshCounts();
    })().catch(report);
  }, [services, report]);
  const showSettings = useCallback(() => setSettingsOpen(true), []),
    shown = !!reader.active && shownId === reader.active.id;
  const busyId =
      reader.opening ?? (reader.active && !shown ? reader.active.document.metadata.id : null),
    opening = busyId && library.documents.find((entry) => entry.id === busyId),
    busy = library.importing
      ? `正在导入「${library.importing}」…`
      : opening
        ? `正在打开「${opening.title}」…`
        : null;
  const platformClass =
    window.desktop?.platform === 'darwin'
      ? 'native-mac'
      : window.desktop?.platform === 'win32'
        ? 'native-win'
        : '';
  return (
    <div className="app-shell" {...dropProps}>
      {(!shown || route.notFound) && (
        <div className={`titlebar ${platformClass}`}>
          {route.notFound && (
            <AppBrand
              onClick={() => {
                route.home();
                close();
              }}
            />
          )}
        </div>
      )}
      <div className="app-body">
        {route.notFound ? (
          <NotFound
            onHome={() => route.home()}
            onBack={route.canReturn ? () => history.back() : undefined}
          />
        ) : (
          <>
            {reader.active && (
              <ReaderStage
                key={reader.active.id}
                session={reader.active}
                services={services}
                appearance={appearance}
                shown={shown}
                onShown={setShownId}
                onBack={close}
                onSettings={showSettings}
              />
            )}
            {!shown && (
              <>
                <LibrarySidebar
                  view={view}
                  books={library.documents}
                  noteCounts={library.counts}
                  dark={dark}
                  onView={(view) => {
                    close();
                    setView(view);
                  }}
                  onToggleTheme={() =>
                    changeSettings({ ...settings, theme: dark ? 'light' : 'dark' })
                  }
                  onSettings={showSettings}
                  onAbout={() => setAboutOpen(true)}
                />
                <main className="library-main">
                  <Library
                    books={library.documents}
                    view={view}
                    noteCounts={library.counts}
                    onImport={openImport}
                    onImportFolder={openFolder}
                    canImportFolder={folders}
                    onOpen={open}
                    onUpdate={(book) => {
                      void services.library
                        .update(book.id, { favorite: book.favorite })
                        .catch(report);
                    }}
                    onDelete={setDeleting}
                    onBrowse={() => setView('all')}
                  />
                  {!services.registry.providers().length && (
                    <div className="plugin-repair" role="alert">
                      <p>还没有可用的阅读插件。</p>
                      <Button onClick={showSettings}>管理插件</Button>
                    </div>
                  )}
                </main>
              </>
            )}
          </>
        )}
      </div>
      <input
        className="visually-hidden"
        aria-label="选择阅读文件"
        type="file"
        accept={extensions.map((extension) => '.' + extension).join(',')}
        multiple
        ref={fileInput}
        onChange={(event) => {
          if (event.target.files)
            void fileSources([...event.target.files])
              .then(importing)
              .catch(report);
          event.target.value = '';
        }}
      />
      <input
        className="visually-hidden"
        aria-label="选择文档文件夹"
        type="file"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        ref={folderInput}
        onChange={(event) => {
          if (event.target.files?.length)
            void folderSource([...event.target.files])
              .then((source) => importing([source]))
              .catch(report);
          event.target.value = '';
        }}
      />
      {settingsOpen && (
        <SettingsModal
          services={services}
          settings={settings}
          onChange={changeSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      <UpdateNotice updates={services.updates} onOpen={() => setAboutOpen(true)} />
      {aboutOpen && <AboutDialog updates={services.updates} onClose={() => setAboutOpen(false)} />}
      {deleting && (
        <DeleteBookDialog
          book={deleting}
          onConfirm={() => {
            void services.library
              .remove(deleting.id)
              .then(() => setDeleting(null))
              .catch(report);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
      <InteractionDialog service={services.interactions} />
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
            <div className="drop-overlay">
              <div>
                <Upload size={44} />
                <h2>把新书放在这里</h2>
                <p>松开鼠标，将文档收入书架</p>
              </div>
            </div>
          </Exiting>
        )}
        {toast.message && (
          <Exiting key="toast">
            <m.div className="toast" role="status" {...rise}>
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
function ReaderStage({
  session,
  services,
  appearance,
  shown,
  onShown,
  onBack,
  onSettings,
}: {
  session: ReadingSession;
  services: AppServices;
  appearance: ReadingAppearance;
  shown: boolean;
  onShown(id: string): void;
  onBack(): void;
  onSettings(): void;
}) {
  const snapshot = useStore(session.state);
  useEffect(() => {
    if (!snapshot.ready && !snapshot.error) return;
    onShown(session.id);
  }, [snapshot.ready, snapshot.error, session, onShown]);
  return (
    <div className={`reader-stage ${shown ? '' : 'pending'}`}>
      <ReaderShell
        session={session}
        services={services}
        appearance={appearance}
        onBack={onBack}
        onSettings={onSettings}
      />
    </div>
  );
}

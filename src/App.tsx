import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Heart,
  Clock3,
  NotebookPen,
  Sun,
  Moon,
  Settings2,
  Plus,
  ArrowUpRight,
  FolderOpen,
  Upload,
  X,
  ShieldCheck,
  Command,
  Check,
  LockKeyhole,
} from 'lucide-react';
import type { Book, Settings } from './types';
import { storage } from './lib/db';
import { importPDF } from './lib/pdf';
import { Library, type LibraryView } from './components/Library';
import { Reader } from './components/Reader';
import { IconButton, Modal, SettingsModal, Spinner } from './components/UI';
const defaults: Settings = {
  theme: 'light',
  readerTheme: 'follow',
  fontSize: 19,
  font: 'serif',
  lineHeight: 1.8,
  width: 660,
};
function readSettings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem('folio-settings') || '{}'),
    } as Settings;
  } catch {
    return defaults;
  }
}
let initialLoad: Promise<Book[]> | undefined;
async function initialize() {
  const books = await storage.books();
  if (books.length || localStorage.getItem('folio-initialized')) return books;
  const manifest = (await fetch('./samples/manifest.json').then((r) => r.json())) as {
    slug: string;
    category: string;
  }[];
  const samples: Book[] = [];
  for (const entry of manifest) {
    const response = await fetch(`./samples/${entry.slug}.pdf`);
    if (!response.ok) throw new Error('示例文件加载失败');
    const book = await importPDF(await response.blob(), entry.slug + '.pdf');
    book.sample = true;
    book.category = entry.category;
    book.addedAt = Date.now() - samples.length * 1000;
    await storage.putBook(book);
    samples.push(book);
  }
  localStorage.setItem('folio-initialized', '1');
  return samples;
}
export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [settings, setSettings] = useState(readSettings);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const [view, setView] = useState<LibraryView>('all');
  const [active, setActive] = useState<Book | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<Book | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const passwordResolver = useRef<((value: string | null) => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDepth = useRef(0);
  const importing = useRef(false);
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 5500);
  }, []);
  const refreshCounts = useCallback(() => {
    void storage
      .annotations()
      .then((marks) => {
        const next: Record<string, number> = {};
        marks.forEach((m) => (next[m.bookId] = (next[m.bookId] || 0) + 1));
        setCounts(next);
      })
      .catch(() => notify('无法读取笔记'));
  }, [notify]);
  useEffect(() => {
    initialLoad ||= initialize();
    void initialLoad
      .then(setBooks)
      .catch((e) => {
        notify('书库加载失败：' + String(e));
        initialLoad = undefined;
      })
      .finally(() => setLoading(false));
    refreshCounts();
    const media = matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [notify, refreshCounts]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('folio-settings', JSON.stringify(settings));
  }, [settings, dark]);
  const askPassword = useCallback(
    () =>
      new Promise<string | null>((resolve) => {
        passwordResolver.current = resolve;
        setPassword('此 PDF 受密码保护');
        setPasswordValue('');
      }),
    [],
  );
  const finishPassword = useCallback((value: string | null) => {
    setPassword(null);
    passwordResolver.current?.(value);
    passwordResolver.current = null;
  }, []);
  const updateBook = useCallback(
    (book: Book) => {
      setBooks((previous) => previous.map((b) => (b.id === book.id ? book : b)));
      setActive((previous) => (previous?.id === book.id ? book : previous));
      void storage.putBook(book).catch(() => notify('保存失败，请检查本机存储空间'));
    },
    [notify],
  );
  const importFiles = useCallback(
    async (files: { name: string; blob: Blob }[]) => {
      if (importing.current) return;
      importing.current = true;
      let added = 0;
      try {
        for (const file of files) {
          setBusy(`正在导入 ${file.name}`);
          if (!/\.pdf$/i.test(file.name)) {
            notify('只支持 PDF 文件');
            continue;
          }
          if (file.blob.size > 512 * 1024 * 1024) {
            notify('文件超过 512 MB，请使用较小的 PDF');
            continue;
          }
          try {
            let book: Book;
            try {
              book = await importPDF(file.blob, file.name);
            } catch (error) {
              if (error instanceof Error && error.name === 'PasswordException') {
                const pass = await askPassword();
                if (pass === null) continue;
                book = await importPDF(file.blob, file.name, pass);
              } else throw error;
            }
            const existing = (await storage.books()).find((b) => b.id === book.id);
            if (existing) {
              notify(`${existing.title} 已在书库中`);
              continue;
            }
            await storage.putBook(book);
            setBooks((previous) => [book, ...previous]);
            added++;
          } catch (error) {
            notify(
              `「${file.name}」导入失败：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        if (added) {
          setView('all');
          notify(`已把 ${added} 本新书收入书架`);
        }
      } finally {
        setBusy(null);
        importing.current = false;
      }
    },
    [askPassword, notify],
  );
  const openImport = useCallback(() => {
    if (importing.current) return;
    if (window.desktop) {
      void window.desktop
        .openPDF()
        .then((files) => {
          if (files)
            void importFiles(
              files.map((f) => ({
                name: f.name,
                blob: new Blob([f.data.slice().buffer], { type: 'application/pdf' }),
              })),
            );
        })
        .catch((e) => notify('无法打开文件：' + String(e)));
    } else fileInput.current?.click();
  }, [importFiles, notify]);
  useEffect(() => {
    const event = () => openImport();
    window.addEventListener('folio:open', event);
    const stop = window.desktop?.onOpenFile((f) => {
      void importFiles([
        { name: f.name, blob: new Blob([f.data.slice().buffer], { type: 'application/pdf' }) },
      ]);
    });
    window.desktop?.ready();
    const shortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        openImport();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => {
      window.removeEventListener('folio:open', event);
      window.removeEventListener('keydown', shortcut);
      stop?.();
    };
  }, [openImport, importFiles]);
  const closeReader = useCallback(() => {
    setActive(null);
    refreshCounts();
  }, [refreshCounts]);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  async function deleteBook() {
    if (!deleting) return;
    try {
      await storage.deleteBook(deleting.id);
      setBooks((b) => b.filter((v) => v.id !== deleting.id));
      notify('已从书库移除');
      setDeleting(null);
      refreshCounts();
    } catch {
      notify('无法移除这本书');
    }
  }
  const nav = (next: LibraryView) => {
    if (active) closeReader();
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
        void importFiles(
          [...e.dataTransfer.files].map((file) => ({ name: file.name, blob: file })),
        );
      }}
    >
      <div
        className={`titlebar ${window.desktop?.platform === 'darwin' ? 'native-mac' : window.desktop?.platform === 'win32' ? 'native-win' : ''}`}
      >
        <div className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>Folio</span>
        <span className="titlebar-right">A quiet place to read.</span>
      </div>
      <div className="app-body">
        <nav className="rail" aria-label="应用导航">
          <button className="brand-mark" aria-label="Folio 我的书架" onClick={() => nav('all')}>
            <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" width="44" height="44" />
          </button>
          <div className="rail-navigation">
            <IconButton
              label="我的书架"
              active={!active && view === 'all'}
              onClick={() => nav('all')}
            >
              <BookOpen size={21} />
            </IconButton>
            <IconButton
              label="最近阅读"
              active={!active && view === 'recent'}
              onClick={() => nav('recent')}
            >
              <Clock3 size={20} />
            </IconButton>
            <IconButton
              label="心头好"
              active={!active && view === 'favorites'}
              onClick={() => nav('favorites')}
            >
              <Heart size={20} />
            </IconButton>
            <IconButton
              label="阅读笔记"
              active={!active && view === 'notes'}
              onClick={() => nav('notes')}
            >
              <NotebookPen size={20} />
            </IconButton>
          </div>
          <div className="rail-bottom">
            <IconButton
              label={dark ? '切换浅色模式' : '切换深色模式'}
              onClick={() => setSettings((s) => ({ ...s, theme: dark ? 'light' : 'dark' }))}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </IconButton>
            <IconButton label="设置" onClick={openSettings}>
              <Settings2 size={20} />
            </IconButton>
            <button className="avatar" aria-label="关于 Folio" onClick={() => setAbout(true)}>
              F
            </button>
          </div>
        </nav>
        {active ? (
          <Reader
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
              <div className="sidebar-brand">
                folio<span>阅读，与自己相处</span>
              </div>
              <div className="sidebar-section-label">LIBRARY</div>
              <div className="sidebar-navigation">
                {(
                  [
                    ['all', '我的书架', BookOpen],
                    ['recent', '最近阅读', Clock3],
                    ['favorites', '心头好', Heart],
                    ['notes', '阅读笔记', NotebookPen],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button
                    className={view === v ? 'selected' : ''}
                    key={v}
                    onClick={() => setView(v)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                    <b>
                      {v === 'all'
                        ? books.length
                        : v === 'favorites'
                          ? books.filter((b) => b.favorite).length
                          : v === 'notes'
                            ? Object.values(counts).reduce((n, c) => n + c, 0)
                            : books.filter((b) => b.openedAt > 0).length}
                    </b>
                  </button>
                ))}
              </div>
              <div className="sidebar-section-label collections-label">COLLECTIONS</div>
              <div className="collections">
                {(['设计与灵感', '技术与思考', '生活与阅读'] as const).map((v, i) => (
                  <button
                    key={v}
                    className={view === v ? 'selected' : ''}
                    onClick={() => setView(v)}
                  >
                    <i className={`collection-dot dot-${i}`} />
                    <span>{v}</span>
                    <b>{books.filter((b) => b.category === v).length}</b>
                  </button>
                ))}
              </div>
              <button className="sidebar-import" onClick={openImport}>
                <Plus size={15} />
                添加新书
              </button>
              <div className="sidebar-bottom-card">
                <div>
                  <ShieldCheck size={18} />
                  <strong>只属于你的书库</strong>
                </div>
                <p>
                  文件和想法，安静地
                  <br />
                  留在你的电脑里。
                </p>
                <span>
                  LOCAL FIRST <Check size={12} />
                </span>
              </div>
              <button className="about-link" onClick={() => setAbout(true)}>
                关于 Folio <ArrowUpRight size={13} />
              </button>
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
                  onOpen={(book) => setActive(book)}
                  onUpdate={updateBook}
                  onDelete={setDeleting}
                />
              )}
            </main>
          </>
        )}
      </div>
      <input
        className="visually-hidden"
        aria-label="选择 PDF 文件"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        ref={fileInput}
        onChange={(e) => {
          if (e.target.files)
            void importFiles([...e.target.files].map((file) => ({ name: file.name, blob: file })));
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
      {about && (
        <Modal title="读书，是回到自己。" onClose={() => setAbout(false)}>
          <div className="about-logo">
            folio<span>1.0</span>
          </div>
          <p>一个安静、简洁的 PDF 阅读空间。为文字留白，为思考留一处页边。</p>
          <div className="about-features">
            <span>
              <FolderOpen size={17} />
              本地书库与阅读进度
            </span>
            <span>
              <BookOpen size={17} />
              原版与全书统一阅读
            </span>
            <span>
              <NotebookPen size={17} />
              高光、划线与页边笔记
            </span>
            <span>
              <Sun size={17} />
              为昼夜准备的阅读主题
            </span>
          </div>
          <div className="shortcut-list">
            <div>
              <span>导入 PDF</span>
              <kbd>
                <Command size={12} /> / Ctrl + O
              </kbd>
            </div>
            <div>
              <span>搜索文档</span>
              <kbd>
                <Command size={12} /> / Ctrl + F
              </kbd>
            </div>
            <div>
              <span>翻页</span>
              <kbd>← →</kbd>
            </div>
          </div>
          <p className="small muted">
            示例书籍是 Folio 原创演示文档。应用会检查整份
            PDF，适合的文档统一排版并保留图片；无法完整、可靠地重排时，整本使用原版。文档不会上传。
          </p>
        </Modal>
      )}
      {deleting && (
        <Modal title="移除这本书？" onClose={() => setDeleting(null)}>
          <p>将从本机书库移除「{deleting.title}」及其批注。你导入前的原始文件不受影响。</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              保留
            </button>
            <button className="danger-button" onClick={() => void deleteBook()}>
              移除书籍和批注
            </button>
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
            <input
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
              <button type="button" className="secondary" onClick={() => finishPassword(null)}>
                取消
              </button>
              <button className="primary" type="submit">
                打开 PDF
              </button>
            </div>
          </form>
        </Modal>
      )}
      {busy && (
        <div className="busy-overlay">
          <Spinner text={busy} />
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div>
            <Upload size={44} />
            <h2>把新书放在这里</h2>
            <p>松开鼠标，将 PDF 收入你的书架</p>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭通知" onClick={() => setToast('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

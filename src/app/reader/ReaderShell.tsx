import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { AnimatePresence } from 'motion/react';
import { useStore } from '@leaf/plugin-sdk/react';
import type { ActionContext, ReaderAction, PanelFactory, ViewFactory } from '@leaf/plugin-sdk/view';
import type { MarkColor, MarkKind } from '@leaf/contracts/annotations';
import type { Locator, OutlineEntry, SearchHit, DocumentHandle } from '@leaf/contracts/documents';
import type { ReadingAppearance, TextSelection, ViewSetting } from '@leaf/contracts/reader';
import { Button } from '@leaf/ui/primitives/button';
import { Input } from '@leaf/ui/primitives/input';
import { Tabs, TabsList, TabsTrigger } from '@leaf/ui/primitives/tabs';
import { OutlineTree } from '@leaf/ui/reading/OutlineTree';
import { revealIn } from '@leaf/ui/reading/reveal';
import { NativeSelect, NativeSelectOption } from '@leaf/ui/primitives/native-select';
import { IconButton, Exiting, Spinner } from '@leaf/ui/primitives/composition';
import * as Menu from '@leaf/ui/primitives/dropdown-menu';
import * as Icons from '@leaf/ui/icons';
import { useResizablePanel } from '@leaf/ui/hooks/useResizablePanel';
import type { AppServices } from '../compose';
import type { ReadingSession } from '../../core/reader/session';
import { NotesPanel } from './NotesPanel';
import { SelectionTools, MarkTools } from './AnnotationTools';
import { BookmarkToggle } from './BookmarkToggle';
import { useReaderShortcuts } from './useReaderShortcuts';
import { ExtensionSlot } from '../plugins/ExtensionSlot';
import { EmptyState } from '../components/Mascot';
import { usePinchScale } from './usePinchScale';
import { Tip } from '@leaf/ui/primitives/composition';
import { saveFile } from '../../platform/files/save';

export function ReaderShell({
  session,
  services,
  appearance,
  onBack,
  onSettings,
}: {
  session: ReadingSession;
  services: AppServices;
  appearance: ReadingAppearance;
  onBack(): void;
  onSettings(): void;
}) {
  const snapshot = useStore(session.state),
    annotations = useStore(session.annotations.state),
    bookmarks = useStore(session.bookmarks);
  useStore(services.registry.revision);
  const viewer = useRef<HTMLDivElement>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const [left, setLeft] = useState(false),
    [notes, setNotes] = useState(false),
    [focus, setFocus] = useState(false),
    [tab, setTab] = useState<'outline' | 'pages' | 'bookmarks' | 'search'>('outline');
  const [panel, setPanel] = useState<{ id: string; selection: TextSelection | null } | null>(null),
    [query, setQuery] = useState(''),
    [hits, setHits] = useState<SearchHit[]>([]),
    [searching, setSearching] = useState(false),
    [outline, setOutline] = useState<OutlineEntry[] | null>(null);
  const [preferredOutline, setPreferredOutline] = useState<string | null>(null);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);
  const [removed, setRemoved] = useState<typeof annotations.marks | null>(null);
  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 6000);
    return () => clearTimeout(timer);
  }, [removed]);
  useEffect(() => {
    if (removed && removed !== annotations.marks) setRemoved(null);
  }, [removed, annotations.marks]);
  const removeMark = async (id: string) => {
    await session.annotations.remove(id);
    setRemoved(session.annotations.state.get().marks);
    session.clearSelection();
  };
  const [continuous, setContinuous] = useState(false),
    [color, setColor] = useState<MarkColor>('amber'),
    [exporting, setExporting] = useState(false);
  const document = session.document,
    navigation = document.navigation;
  const factory = services.registry
    .list('views')
    .find(
      (entry) =>
        entry.pluginId === session.reference.pluginId &&
        (entry.implementation as ViewFactory).providerId === session.reference.providerId,
    )?.implementation as ViewFactory | undefined;
  const notify = services.notify;
  const run = useCallback(
    (promise: Promise<unknown>) => {
      void promise.catch((error) => notify(error instanceof Error ? error.message : String(error)));
    },
    [notify],
  );
  const currentAppearance = useRef(appearance);
  currentAppearance.current = appearance;
  useEffect(() => {
    if (!viewer.current) return;
    if (!factory) {
      session.fail('阅读插件没有注册文档视图');
      return;
    }
    const binding = session.bindView();
    void factory
      .mount({
        container: viewer.current,
        document,
        position: session.snapshot().position,
        appearance: currentAppearance.current,
        signal: binding.signal,
        emit: binding.emit,
        navigate: (locator) => session.navigate(locator),
        notify,
      })
      .then((view) => binding.attach(view))
      .catch((error) => {
        if (!binding.signal.aborted) binding.emit({ type: 'error', message: String(error) });
      });
    return () => {
      void binding.dispose();
    };
  }, [factory, session, document, notify]);
  useEffect(() => session.setAppearance(appearance), [session, appearance]);
  useEffect(() => {
    const controller = new AbortController();
    if (document.outline)
      void document.outline
        .read(AbortSignal.any([controller.signal, session.signal]))
        .then(setOutline)
        .catch((error) => {
          if (!controller.signal.aborted) {
            setOutline([]);
            notify('目录未能加载：' + String(error));
          }
        });
    else setOutline([]);
    return () => controller.abort();
  }, [document, session, notify]);
  useEffect(() => {
    session.setSearch(query);
    setHits([]);
    if (!query.trim() || !document.search) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void document
        .search!.search(query, {
          limit: 1000,
          signal: AbortSignal.any([session.signal, controller.signal]),
        })
        .then((items) => {
          if (!controller.signal.aborted) {
            setHits(items);
            setSearching(false);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setSearching(false);
            notify('搜索未完成：' + String(error));
          }
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, document, session, notify]);
  const selectionKey = useRef('');
  useEffect(() => {
    if (!snapshot.selection) {
      selectionKey.current = '';
      return;
    }
    if (!continuous) return;
    const key = JSON.stringify(snapshot.selection);
    if (selectionKey.current === key) return;
    selectionKey.current = key;
    run(session.annotate('highlight', color));
  }, [snapshot.selection, continuous, color, session, run]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !(event.target as HTMLElement)?.closest(
          '.annotation-popover,.selection-toolbar,.notes-panel,.extension-panel',
        )
      ) {
        if (session.snapshot().activeAnnotation) session.clearSelection();
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [session]);
  const openPanel = useCallback((id: string, selection?: TextSelection | null) => {
    setPanel({ id, selection: selection ?? null });
    setNotes(false);
    setFocus(false);
  }, []);
  const actionContext: ActionContext = {
    session,
    selection: snapshot.selection,
    openPanel,
    notify,
  };
  const selectionActions = services.registry
    .list('selectionActions')
    .map((entry) => entry.implementation as ReaderAction)
    .filter((entry) => !entry.available || entry.available(actionContext));
  const toolbarActions = services.registry
    .list('toolbarActions')
    .map((entry) => entry.implementation as ReaderAction)
    .filter((entry) => !entry.available || entry.available(actionContext));
  const panelFactory = panel && services.registry.resolve<PanelFactory>('panels', panel.id);
  const panelMount = useCallback(
    (container: HTMLElement) =>
      panelFactory!.mount(container, {
        session,
        selection: panel?.selection ?? null,
        close: () => setPanel(null),
        openSettings: onSettings,
        notify,
      }),
    [panelFactory, session, panel, onSettings, notify],
  );
  const capabilities = session.capabilities(),
    scale = capabilities?.settings.find(
      (entry) => entry.group === 'scale' && entry.kind === 'number',
    );
  usePinchScale(
    viewer,
    scale,
    scale ? Number(snapshot.position?.settings[scale.id] ?? scale.default ?? 1) : 1,
    session,
  );
  useEffect(() => {
    if (left && tab === 'search' && !focus) searchInput.current?.focus();
  }, [left, tab, focus]);
  const valueOf = (setting: ViewSetting) =>
    snapshot.position?.settings[setting.id] ?? setting.default;
  const adjustScale = (direction: number) => {
    if (!scale) return;
    const next = Math.max(
      scale.min ?? 0.5,
      Math.min(
        scale.max ?? 2,
        Math.round((Number(valueOf(scale)) + direction * (scale.step ?? 0.1)) * 100) / 100,
      ),
    );
    session.setSettings({ [scale.id]: next });
  };
  const jump = (locator: Locator) => run(session.navigate(locator));
  const openSearch = () => {
    setLeft(true);
    setTab('search');
    setFocus(false);
    requestAnimationFrame(() => searchInput.current?.focus());
  };
  useReaderShortcuts({
    search: openSearch,
    undo: () => run(session.annotations.undo()),
    redo: () => run(session.annotations.redo()),
    zoomIn: () => adjustScale(1),
    zoomOut: () => adjustScale(-1),
    resetZoom: () => {
      if (scale) session.setSettings({ [scale.id]: scale.default ?? 1 });
    },
    page: (direction) => run(session.turn(direction)),
    screen: (direction) => {
      const container = viewer.current;
      if (!container) return;
      const boundary =
        direction > 0
          ? container.scrollTop + container.clientHeight >= container.scrollHeight - 2
          : container.scrollTop <= 2;
      if (boundary) run(session.turn(direction));
      else container.scrollBy({ top: direction * container.clientHeight * 0.9 });
    },
    escape: () => {
      session.clearSelection();
      setFocus(false);
      setContinuous(false);
    },
    toggleFocus: () => setFocus((value) => !value),
  });
  const annotate = async (kind: MarkKind, writeNote = false) => {
    const mark = await session.annotate(kind, color);
    if (mark && writeNote) focusNote(mark.id);
  };
  const focusNote = (id: string) => {
    setFocusNoteId(id);
    setNotes(true);
    setPanel(null);
    setFocus(false);
    session.clearSelection();
  };
  const selected =
    snapshot.activeAnnotation &&
    annotations.marks.find((entry) => entry.id === snapshot.activeAnnotation!.id);
  const exportNotes = async () => {
    await services.flush();
    const text =
      `# ${document.metadata.title}\n\n` +
      session.annotations.state
        .get()
        .marks.map(
          (mark) =>
            `## ${document.locators.label(mark.targets[0])}\n\n> ${mark.quote.replace(/\n/g, '\n> ')}\n\n${mark.note}\n`,
        )
        .join('\n');
    await saveFile(
      document.metadata.title + '-笔记.md',
      new TextEncoder().encode(text),
      'text/markdown',
    );
    notify('已导出笔记');
  };
  const exportDocument = async () => {
    if (!document.export) return;
    setExporting(true);
    try {
      await services.flush();
      const result = await document.export.run(
        session.annotations.state.get().marks,
        session.signal,
      );
      await saveFile(result.filename, result.data, result.mime);
      notify('已导出批注文档');
    } finally {
      setExporting(false);
    }
  };
  const activeOutline =
    snapshot.position && outline
      ? (document.outline?.active?.(snapshot.position.locator, outline, preferredOutline) ??
        preferredOutline)
      : null;
  const index = snapshot.position && navigation ? navigation.index(snapshot.position.locator) : 0;
  return (
    <div className={`reader ${focus ? 'reader-focus' : ''}`} data-session-id={session.id}>
      <header
        className={`reader-header ${window.desktop?.platform === 'darwin' ? 'native-mac' : window.desktop?.platform === 'win32' ? 'native-win' : ''}`}
      >
        <div className="reader-header-start">
          <IconButton label="返回书架" onClick={onBack}>
            <Icons.ArrowLeft size={18} />
          </IconButton>
          <div className="tool-group reader-navigation">
            <IconButton
              label="文档导航"
              active={left && tab !== 'search'}
              onClick={() => {
                setLeft(tab === 'search' || !left);
                if (tab === 'search') setTab('outline');
              }}
            >
              <Icons.PanelLeft size={18} />
            </IconButton>
            {document.search && (
              <IconButton
                label="搜索文档"
                active={left && tab === 'search'}
                onClick={() => (left && tab === 'search' ? setLeft(false) : openSearch())}
              >
                <Icons.Search size={17} />
              </IconButton>
            )}
            <IconButton
              label="返回刚才的位置"
              disabled={!snapshot.canReturn}
              onClick={() => run(session.returnToPrevious())}
            >
              <Icons.History size={17} />
            </IconButton>
          </div>
        </div>
        <div className="reader-title" title={document.metadata.title}>
          <strong>{document.metadata.title}</strong>
        </div>
        <div className="reader-header-end">
          {scale && (
            <div className="tool-group reader-zoom">
              <IconButton label="缩小" onClick={() => adjustScale(-1)}>
                <Icons.Minus size={15} />
              </IconButton>
              <Button
                variant="ghost"
                className="zoom-label"
                onClick={() => session.setSettings({ [scale.id]: scale.default ?? 1 })}
              >
                {Math.round(Number(valueOf(scale)) * 100)}%
              </Button>
              <IconButton label="放大" onClick={() => adjustScale(1)}>
                <Icons.Plus size={15} />
              </IconButton>
            </div>
          )}
          <div className="tool-group reader-actions">
            <BookmarkToggle
              bookmarked={session.bookmarked()}
              onToggle={() => run(session.toggleBookmark())}
            />
            {capabilities?.annotations && (
              <IconButton
                label="阅读笔记"
                active={notes}
                onClick={() => {
                  setNotes(!notes);
                  setPanel(null);
                }}
              >
                <Icons.NotebookPen size={18} />
              </IconButton>
            )}
            {toolbarActions.map((action) => (
              <ActionButton key={action.id} action={action} context={actionContext} />
            ))}
            <Menu.DropdownMenu>
              <Menu.DropdownMenuTrigger asChild>
                <Button variant="ghost" className="icon-button" aria-label="更多阅读操作">
                  <Icons.MoreHorizontal size={18} />
                </Button>
              </Menu.DropdownMenuTrigger>
              <Menu.DropdownMenuContent align="end">
                {document.export && (
                  <Menu.DropdownMenuItem
                    disabled={exporting}
                    onSelect={() => run(exportDocument())}
                  >
                    {document.export.label}
                  </Menu.DropdownMenuItem>
                )}
                <Menu.DropdownMenuItem onSelect={() => run(exportNotes())}>
                  导出 Markdown 笔记
                </Menu.DropdownMenuItem>
                {capabilities?.annotations && (
                  <Menu.DropdownMenuCheckboxItem
                    checked={continuous}
                    onCheckedChange={setContinuous}
                  >
                    连续高亮
                  </Menu.DropdownMenuCheckboxItem>
                )}
                <Menu.DropdownMenuSeparator />
                <Menu.DropdownMenuItem onSelect={onSettings}>阅读偏好</Menu.DropdownMenuItem>
              </Menu.DropdownMenuContent>
            </Menu.DropdownMenu>
            <IconButton
              label={focus ? '退出专注阅读' : '专注阅读（F）'}
              active={focus}
              onClick={() => setFocus(!focus)}
            >
              {focus ? <Icons.Minimize size={17} /> : <Icons.Maximize size={17} />}
            </IconButton>
          </div>
        </div>
      </header>
      <div className="reader-body">
        <AnimatePresence initial={false}>
          {left && !focus && (
            <Exiting key="sidebar">
              <Sidebar>
                {tab !== 'search' && (
                  <Tabs
                    value={tab}
                    onValueChange={(value) => setTab(value as typeof tab)}
                    className="sidebar-tabs"
                  >
                    <TabsList aria-label="文档导航视图">
                      {navigation && (
                        <Tip side="bottom" label={navigation.thumbnail ? '页面缩略图' : '文档章节'}>
                          <TabsTrigger
                            value="pages"
                            aria-label={navigation.thumbnail ? '页面缩略图' : '文档章节'}
                          >
                            <Icons.GalleryVerticalEnd size={16} />
                          </TabsTrigger>
                        </Tip>
                      )}
                      <Tip side="bottom" label="文档目录">
                        <TabsTrigger value="outline" aria-label="文档目录">
                          <Icons.TableOfContents size={16} />
                        </TabsTrigger>
                      </Tip>
                      <Tip side="bottom" label="文档书签">
                        <TabsTrigger value="bookmarks" aria-label="文档书签">
                          <Icons.Bookmark size={16} />
                        </TabsTrigger>
                      </Tip>
                    </TabsList>
                  </Tabs>
                )}
                <div className="sidebar-scroll">
                  {tab === 'search' ? (
                    <>
                      <div className="reader-search">
                        <Input
                          ref={searchInput}
                          aria-label="搜索文档内容"
                          placeholder="搜索文档…"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </div>
                      <p className="search-status" aria-live="polite">
                        {searching
                          ? '正在搜索…'
                          : query.trim()
                            ? `${hits.length} 处匹配`
                            : '输入关键词搜索文档'}
                      </p>
                      {searching ? (
                        <Spinner text="正在搜索…" />
                      ) : (
                        hits.map((hit) => (
                          <Button
                            key={hit.id}
                            variant="ghost"
                            className="search-result"
                            onClick={() => {
                              session.setSearch(query, hit.locator);
                              jump(hit.locator);
                            }}
                          >
                            <span>{document.locators.label(hit.locator)}</span>
                            <p>{hit.excerpt}</p>
                          </Button>
                        ))
                      )}
                      {!searching && query.trim() && !hits.length && (
                        <EmptyState
                          scene="search"
                          compact
                          action={{
                            label: '清空搜索',
                            onClick: () => {
                              setQuery('');
                              searchInput.current?.focus();
                            },
                          }}
                        />
                      )}
                    </>
                  ) : tab === 'bookmarks' ? (
                    bookmarks.length ? (
                      bookmarks.map((bookmark) => (
                        <Button
                          variant="ghost"
                          className="outline-item bookmark-item"
                          key={bookmark.id}
                          onClick={() => run(session.openBookmark(bookmark))}
                        >
                          {bookmark.title}
                        </Button>
                      ))
                    ) : (
                      <EmptyState scene="bookmarks" compact />
                    )
                  ) : tab === 'outline' ? (
                    outline === null ? (
                      <Spinner text="正在读取目录…" />
                    ) : outline.length ? (
                      <OutlineTree
                        entries={outline}
                        activeId={activeOutline}
                        label={(entry) =>
                          navigation
                            ? String(navigation.index(entry.locator) + 1)
                            : document.locators.label(entry.locator)
                        }
                        onActivate={(entry) => {
                          setPreferredOutline(entry.id);
                          jump(entry.locator);
                        }}
                      />
                    ) : (
                      <p className="sidebar-hint">这个文档没有目录</p>
                    )
                  ) : navigation ? (
                    <Navigation
                      document={document}
                      session={session}
                      index={index}
                      navigate={jump}
                    />
                  ) : (
                    <p className="sidebar-hint">这个插件不提供章节导航</p>
                  )}
                </div>
              </Sidebar>
            </Exiting>
          )}
        </AnimatePresence>
        <main
          className={`reading-surface ${appearance.theme === 'dark' ? 'reader-dark' : 'reader-light'}`}
          aria-label="阅读正文"
        >
          <div ref={viewer} className="reading-canvas" />
        </main>
        <AnimatePresence>
          {notes && !focus && (
            <Exiting key="notes">
              <NotesPanel
                marks={annotations.marks}
                document={document}
                activeId={snapshot.activeAnnotation?.id ?? null}
                focusId={focusNoteId}
                onFocused={() => setFocusNoteId(null)}
                onNote={(id, text) => session.annotations.note(id, text)}
                onStyle={(id, changes) => run(session.annotations.style(id, changes))}
                onRemove={(mark) => run(removeMark(mark.id))}
                onNavigate={jump}
                onClose={() => setNotes(false)}
                persistence={services.persistence}
                notify={notify}
              />
            </Exiting>
          )}
          {panelFactory && panel && !focus && (
            <Exiting key={panel.id}>
              <ExtensionSlot className="extension-panel" mount={panelMount} />
            </Exiting>
          )}
        </AnimatePresence>
      </div>
      {snapshot.error && (
        <div className="reader-error" role="alert">
          {snapshot.error}
          <Button onClick={onBack}>返回书架</Button>
        </div>
      )}
      {!factory && (
        <div className="reader-error" role="alert">
          阅读插件没有注册文档视图
        </div>
      )}
      <footer className="reader-status">
        <div className="layout-controls">
          {capabilities?.settings
            .filter((setting) => setting.group === 'layout')
            .map((setting) => (
              <SettingControl
                key={setting.id}
                setting={setting}
                value={valueOf(setting)}
                change={(value) => session.setSettings({ [setting.id]: value })}
              />
            ))}
        </div>
        {navigation && (
          <div className="page-controls">
            <IconButton
              label="上一个位置"
              disabled={index <= 0}
              onClick={() => run(session.turn(-1))}
            >
              <Icons.ChevronLeft size={17} />
            </IconButton>
            <LocationInput
              index={index}
              total={navigation.count}
              change={(value) => jump(navigation.locator(value))}
            />
            <span>/ {navigation.count}</span>
            {navigation.detail?.(index) && (
              <span className="location-detail">{navigation.detail(index)}</span>
            )}
            <IconButton
              label="下一个位置"
              disabled={index >= navigation.count - 1}
              onClick={() => run(session.turn(1))}
            >
              <Icons.ChevronRight size={17} />
            </IconButton>
          </div>
        )}
        <span className="save-state" aria-live="polite">
          {annotations.status === 'saving'
            ? '保存中…'
            : annotations.status === 'error'
              ? '保存失败'
              : annotations.status === 'saved'
                ? '已保存'
                : snapshot.progress.label}
        </span>
      </footer>
      <AnimatePresence>
        {snapshot.selection && snapshot.selectionPoint && !continuous && (
          <Exiting key="selection">
            <SelectionTools
              annotations={!!capabilities?.annotations}
              point={snapshot.selectionPoint}
              color={color}
              onColor={setColor}
              onAnnotate={(kind, note) => run(annotate(kind, note))}
              onCopy={() => run(navigator.clipboard.writeText(snapshot.selection!.quote))}
              onClose={() => session.clearSelection()}
              extensions={selectionActions.map((action) => (
                <ActionButton key={action.id} action={action} context={actionContext} />
              ))}
            />
          </Exiting>
        )}
        {selected && snapshot.activeAnnotation && (
          <Exiting key="annotation">
            <MarkTools
              mark={selected}
              position={snapshot.activeAnnotation.point}
              onColor={(color) => run(session.annotations.style(selected.id, { color }))}
              onNote={() => focusNote(selected.id)}
              onDelete={() => run(removeMark(selected.id))}
              onClose={() => session.clearSelection()}
            />
          </Exiting>
        )}
      </AnimatePresence>
      {removed && (
        <div className="undo-notice" role="status">
          批注已删除
          <Button
            variant="ghost"
            onClick={() => {
              run(session.annotations.undo());
              setRemoved(null);
            }}
          >
            撤销
          </Button>
        </div>
      )}
      {continuous && (
        <div className="active-tool">
          连续高亮
          <Button variant="ghost" onClick={() => setContinuous(false)}>
            退出 · Esc
          </Button>
        </div>
      )}
    </div>
  );
}
function ActionButton({ action, context }: { action: ReaderAction; context: ActionContext }) {
  const Icon = (Icons as Record<string, unknown>)[action.icon ?? 'Plus'] as
    ComponentType<{ size?: number }> | undefined;
  return (
    <IconButton
      label={action.label}
      onClick={() => {
        try {
          const result = action.run(context, context.session.signal);
          if (result) void result.catch((error) => context.notify(String(error)));
        } catch (error) {
          context.notify(String(error));
        }
      }}
    >
      {Icon ? <Icon size={18} /> : action.label}
    </IconButton>
  );
}
function Sidebar({ children }: { children: import('react').ReactNode }) {
  const { width, panel, handleProps } = useResizablePanel<HTMLElement>({
    storageKey: 'sidebar-width',
    min: 184,
    max: 440,
    initial: 208,
    edge: 'right',
  });
  return (
    <aside className="reader-sidebar" ref={panel} style={{ width }}>
      {children}
      <div {...handleProps} />
    </aside>
  );
}
function Navigation({
  document,
  session,
  index,
  navigate,
}: {
  document: DocumentHandle;
  session: ReadingSession;
  index: number;
  navigate(locator: Locator): void;
}) {
  const nav = document.navigation!,
    count = nav.count;
  const [start, setStart] = useState(Math.max(0, index - 4));
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setStart(Math.max(0, index - 4));
  }, [index]);
  useEffect(() => {
    const selected = list.current?.querySelector('.thumbnail.selected'),
      scroller = list.current?.closest<HTMLElement>('.sidebar-scroll');
    if (!selected || !scroller) return;
    const reveal = () => revealIn(scroller, selected);
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(selected);
    return () => observer.disconnect();
  }, [index, start]);
  return (
    <div ref={list} className="thumbnail-list">
      {start > 0 && (
        <Button variant="ghost" onClick={() => setStart(Math.max(0, start - 12))}>
          前面的页面
        </Button>
      )}
      {Array.from({ length: Math.min(12, count - start) }, (_, offset) => start + offset).map(
        (item) => (
          <Button
            variant="ghost"
            className={`thumbnail ${index === item ? 'selected' : ''}`}
            key={item}
            aria-label={nav.label(item)}
            onClick={() => navigate(nav.locator(item))}
          >
            {nav.thumbnail && <Thumbnail document={document} session={session} index={item} />}
            <span>{nav.label(item)}</span>
          </Button>
        ),
      )}
      {start + 12 < count && (
        <Button variant="ghost" onClick={() => setStart(start + 12)}>
          后面的页面
        </Button>
      )}
    </div>
  );
}
function Thumbnail({
  document,
  session,
  index,
}: {
  document: DocumentHandle;
  session: ReadingSession;
  index: number;
}) {
  const [url, setURL] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let source = '';
    void document.navigation!.thumbnail!(
      index,
      AbortSignal.any([controller.signal, session.signal]),
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        source = URL.createObjectURL(new Blob([result.data.slice().buffer], { type: result.mime }));
        setURL(source);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (source) URL.revokeObjectURL(source);
    };
  }, [document, session, index]);
  return url ? <img src={url} alt="" /> : <span className="thumbnail-placeholder" />;
}
function LocationInput({
  index,
  total,
  change,
}: {
  index: number;
  total: number;
  change(index: number): void;
}) {
  const [value, setValue] = useState(String(index + 1));
  useEffect(() => setValue(String(index + 1)), [index]);
  return (
    <Input
      aria-label="位置序号"
      type="number"
      min={1}
      max={total}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => change(Math.max(0, Math.min(total - 1, (Number(value) || 1) - 1)))}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
function SettingControl({
  setting,
  value,
  change,
}: {
  setting: ViewSetting;
  value: import('@leaf/shared/types').JsonValue | undefined;
  change(value: import('@leaf/shared/types').JsonValue): void;
}) {
  if (setting.kind === 'boolean')
    return (
      <Button
        variant="ghost"
        aria-label={setting.label}
        aria-pressed={!!value}
        onClick={() => change(!value)}
      >
        {setting.label}
      </Button>
    );
  if (setting.kind === 'choice')
    return (
      <NativeSelect
        aria-label={setting.label}
        value={String(value ?? '')}
        onChange={(event) => change(event.target.value)}
      >
        {setting.options?.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    );
  return (
    <Input
      aria-label={setting.label}
      type="number"
      value={Number(value ?? 0)}
      min={setting.min}
      max={setting.max}
      step={setting.step}
      onChange={(event) => change(Number(event.target.value))}
    />
  );
}

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties } from 'react';
import type { Root } from 'hast';
import type { Annotation } from '@leaf/contracts/annotations';
import type { ViewCommands, ViewPosition, ReadingAppearance } from '@leaf/contracts/reader';
import type { Locator } from '@leaf/contracts/documents';
import { locatorPayload } from '@leaf/contracts/documents';
import type { JsonObject } from '@leaf/shared/types';
import { Store } from '@leaf/shared/events';
import { mountReact } from '@leaf/plugin-sdk/react';
import type { ViewFactory, ViewMountContext } from '@leaf/plugin-sdk/view';
import { PageSkeleton } from '@leaf/ui/reading/PageSkeleton';
import { readingTextClass } from '@leaf/ui/reading/typography';
import { MarkdownHandle, markdownLocator } from '../document/provider';
import { resolveBookLink, isMarkdownAsset } from '../document/import';
import { MarkdownContent } from './MarkdownContent';
import { captureMarkdownSelection } from './selection';
import './markdown.css';

interface ViewState {
  settings: JsonObject;
  appearance: ReadingAppearance;
  annotations: Annotation[];
  activeId: string | null;
  query: string;
  target: Locator;
  ratio: number | null;
  revision: number;
}

const owners = new WeakMap<HTMLElement, symbol>();
export const markdownView: ViewFactory = {
  id: 'leaf.markdown.view',
  providerId: 'leaf.markdown.document',
  async mount(context) {
    if (!(context.document instanceof MarkdownHandle)) throw new Error('Markdown 视图缺少对应文档');
    const document = context.document;
    const state = new Store<ViewState>({
      settings: context.position?.settings ?? { zoom: 1 },
      appearance: context.appearance,
      annotations: [],
      activeId: null,
      query: '',
      target: context.position?.locator ?? document.navigation.locator(0),
      ratio: Number(context.position?.viewport.ratio) || 0,
      revision: 0,
    });
    let closed = false;
    const owner = Symbol();
    owners.set(context.container, owner);
    context.container.classList.add('markdown-scroll');
    const capture = (): ViewPosition => {
      const value = state.get(),
        index = document.navigation.index(value.target);
      const top = context.container.getBoundingClientRect().top;
      const headings = [
        ...context.container.querySelectorAll<HTMLElement>(
          '.markdown-content h1[id],.markdown-content h2[id],.markdown-content h3[id],.markdown-content h4[id],.markdown-content h5[id],.markdown-content h6[id]',
        ),
      ];
      const atEnd =
        context.container.scrollTop >=
        context.container.scrollHeight - context.container.clientHeight - 2;
      const heading =
        headings
          .filter(
            (node) =>
              node.getBoundingClientRect().top <=
              (atEnd ? context.container.getBoundingClientRect().bottom - 24 : top + 64),
          )
          .at(-1)?.id ?? '';
      return {
        locator: markdownLocator(document.metadata, document.chapters[index].path, { heading }),
        settings: value.settings,
        viewport: {
          ratio:
            context.container.scrollTop /
            Math.max(1, context.container.scrollHeight - context.container.clientHeight),
        },
      };
    };
    const mounted = mountReact(
      context.container,
      <View document={document} context={context} state={state} capture={capture} />,
      { onError: (error) => context.emit({ type: 'error', message: String(error) }) },
    );
    const jump = (locator: Locator, ratio: number | null) => {
      if (!document.locators.validate(locator)) throw new Error('无效的 Markdown 位置');
      state.update((value) => ({ ...value, target: locator, ratio, revision: value.revision + 1 }));
    };
    const commands: ViewCommands = {
      capabilities: {
        selection: true,
        annotations: true,
        settings: [
          {
            id: 'zoom',
            label: '字体大小',
            kind: 'number',
            group: 'scale',
            min: 0.5,
            max: 2,
            step: 0.1,
            default: 1,
          },
        ],
      },
      capturePosition: capture,
      async restorePosition(position) {
        state.update((value) => ({ ...value, settings: position.settings }));
        jump(position.locator, Number(position.viewport.ratio) || 0);
      },
      async navigate(locator) {
        jump(locator, null);
      },
      async turn(direction) {
        jump(
          document.navigation.locator(document.navigation.index(state.get().target) + direction),
          0,
        );
      },
      setSettings(settings) {
        const position = capture();
        state.update((value) => ({ ...value, settings: { ...value.settings, ...settings } }));
        jump(position.locator, Number(position.viewport.ratio) || 0);
      },
      setAppearance(appearance) {
        state.update((value) => ({ ...value, appearance }));
      },
      setAnnotations(annotations, activeId) {
        state.update((value) =>
          value.annotations === annotations && value.activeId === activeId
            ? value
            : { ...value, annotations, activeId },
        );
      },
      setSearch(query, hit) {
        state.update((value) => ({ ...value, query }));
        if (hit) jump(hit, null);
      },
      clearSelection() {
        window.getSelection()?.removeAllRanges();
        context.emit({ type: 'selection', selection: null });
      },
      dispose() {
        if (closed) return;
        closed = true;
        mounted.dispose();
        if (owners.get(context.container) === owner) {
          owners.delete(context.container);
          context.container.classList.remove('markdown-scroll', 'markdown-dark');
        }
      },
    };
    return commands;
  },
};

function View({
  document: book,
  context,
  state,
  capture,
}: {
  document: MarkdownHandle;
  context: ViewMountContext;
  state: Store<ViewState>;
  capture(): ViewPosition;
}) {
  const value = useSyncExternalStore(state.subscribe, state.get, state.get);
  const [rendered, setRendered] = useState<{ page: number; tree: Root; revision: number } | null>(
    null,
  );
  const [assets, setAssets] = useState<Record<string, string>>({});
  const article = useRef<HTMLElement>(null);
  const page = book.navigation.index(value.target) + 1;
  const chapter = book.chapters[page - 1];
  const restoring = useRef(true),
    restored = useRef(-1);
  const callbacks = useRef({ value, capture, page });
  callbacks.current = { value, capture, page };
  const assetKey = useMemo(
    () => JSON.stringify(imagePaths(rendered?.tree, chapter.path)),
    [rendered?.tree, chapter.path],
  );
  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    context.signal.addEventListener('abort', abort, { once: true });
    void book.engine
      .render(page, value.query, book.pageMarks(value.annotations, page), controller.signal)
      .then((tree) => {
        if (!controller.signal.aborted) setRendered({ page, tree, revision: value.revision });
      })
      .catch((error) => {
        if (!controller.signal.aborted) context.emit({ type: 'error', message: String(error) });
      });
    return () => {
      controller.abort();
      context.signal.removeEventListener('abort', abort);
    };
  }, [book, context, page, value.annotations, value.query, value.revision]);
  useEffect(() => {
    const controller = new AbortController(),
      urls: string[] = [];
    setAssets({});
    void (async () => {
      const selected = new Set<string>(JSON.parse(assetKey));
      const current: Record<string, string> = {};
      for (const resource of book.record.source.resources.filter(
        (resource) => selected.has(resource.path) && isMarkdownAsset(resource.path),
      )) {
        const bytes = await book.services.readResource(resource.path, controller.signal);
        controller.signal.throwIfAborted();
        const mime = imageMime(resource.path);
        const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
        urls.push(url);
        current[resource.path] = url;
      }
      if (!controller.signal.aborted) setAssets(current);
    })().catch((error) => {
      if (!controller.signal.aborted) context.notify('图片加载失败：' + String(error));
    });
    return () => {
      controller.abort();
      urls.forEach(URL.revokeObjectURL);
    };
  }, [book, context, assetKey]);
  useEffect(() => {
    if (context.signal.aborted) return;
    context.container.classList.toggle('markdown-dark', value.appearance.theme === 'dark');
  }, [context, value.appearance.theme]);
  const emitPosition = useCallback(() => {
    const current = callbacks.current;
    const ordinal = current.page,
      total = book.chapters.length;
    context.emit({
      type: 'position',
      position: current.capture(),
      progress: { fraction: ordinal / total, ordinal, total, label: `${ordinal} / ${total}` },
    });
  }, [book.chapters.length, context]);
  const restore = useCallback(() => {
    const current = callbacks.current.value;
    const payload = locatorPayload(current.target);
    const content = article.current;
    if (!content) return;
    const heading =
      typeof payload.heading === 'string'
        ? [...content.querySelectorAll<HTMLElement>('[id]')].find(
            (node) => node.id === payload.heading || node.id === 'md-' + payload.heading,
          )
        : null;
    const offset =
      typeof payload.offset === 'number'
        ? [...content.querySelectorAll<HTMLElement>('[data-md-start]')].find(
            (node) =>
              Number(node.dataset.mdStart) <= Number(payload.offset) &&
              Number(node.dataset.mdEnd) > Number(payload.offset),
          )
        : null;
    if (current.ratio === null && (heading || offset)) {
      (heading || offset)!.scrollIntoView({ block: 'start' });
      restoring.current = false;
    } else
      context.container.scrollTo({
        top:
          (current.ratio ?? 0) *
          Math.max(0, context.container.scrollHeight - context.container.clientHeight),
      });
    emitPosition();
  }, [context, emitPosition]);
  useLayoutEffect(() => {
    if (
      !rendered ||
      rendered.page !== page ||
      rendered.revision !== value.revision ||
      restored.current === value.revision
    )
      return;
    restored.current = value.revision;
    restoring.current = true;
    restore();
    context.emit({ type: 'ready' });
  }, [rendered, page, value.revision, value.settings, context, restore]);
  useEffect(() => {
    const container = context.container;
    let frame = 0,
      dragging = false;
    const selection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (dragging || !article.current) return;
        const target = captureMarkdownSelection(article.current, callbacks.current.page);
        if (!target && callbacks.current.value.activeId) return;
        context.emit({
          type: 'selection',
          selection: target
            ? {
                quote: target.quote,
                anchors: [
                  markdownLocator(book.metadata, book.chapters[callbacks.current.page - 1].path, {
                    offset: target.start,
                    end: target.end,
                  }),
                ],
              }
            : null,
          ...(target ? { point: { x: target.x, y: target.y } } : {}),
        });
      });
    };
    const down = (event: PointerEvent) => {
      dragging = !!article.current?.contains(event.target as Node);
      restoring.current = false;
    };
    const up = () => {
      dragging = false;
      selection();
    };
    const scroll = () => {
      context.emit({ type: 'selection', selection: null });
      emitPosition();
    };
    const wheel = () => {
      restoring.current = false;
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('selectionchange', selection);
    container.addEventListener('scroll', scroll, { passive: true });
    container.addEventListener('wheel', wheel, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('selectionchange', selection);
      container.removeEventListener('scroll', scroll);
      container.removeEventListener('wheel', wheel);
    };
  }, [book, context, emitPosition]);
  const link = useCallback(
    (href: string) => {
      const target = resolveBookLink(chapter.path, href);
      if (target && book.chapters.some((entry) => entry.path === target.path))
        void context
          .navigate(
            markdownLocator(
              book.metadata,
              target.path,
              target.hash ? { heading: target.hash } : {},
            ),
          )
          .catch((error) => context.notify(String(error)));
      else if (/^https?:\/\//i.test(href))
        void book.services.openExternal(href).catch((error) => context.notify(String(error)));
      else context.notify('链接指向的文件未包含在这本书中');
    },
    [book, chapter.path, context],
  );
  const imageLoaded = useCallback(() => {
    if (restoring.current) restore();
  }, [restore]);
  return (
    <article
      ref={article}
      className={`markdown-content ${readingTextClass} max-w-[42em] ${rendered?.page === page ? '' : 'stale'}`}
      style={
        {
          '--typeset-size': `${18 * Math.max(0.5, Math.min(2, Number(value.settings.zoom) || 1))}px`,
        } as CSSProperties
      }
      aria-label={chapter.title}
      onClick={(event) => {
        if (!window.getSelection()?.isCollapsed) return;
        const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-mark-id]');
        const box = mark?.getBoundingClientRect();
        context.emit({
          type: 'annotation',
          id: mark?.dataset.markId ?? null,
          ...(box
            ? {
                point: {
                  x: Math.max(16, Math.min(window.innerWidth - 340, box.left)),
                  y: Math.max(56, box.top - 54),
                },
              }
            : {}),
        });
      }}
    >
      {rendered ? (
        <MarkdownContent
          tree={rendered.tree}
          path={book.chapters[rendered.page - 1].path}
          assets={assets}
          onLink={link}
          onImageLoad={imageLoaded}
        />
      ) : (
        <PageSkeleton label="正在读取章节…" paper={false} />
      )}
    </article>
  );
}
function imagePaths(tree: Root | undefined, path: string) {
  const selected = new Set<string>();
  const visit = (node: import('hast').Root | import('hast').Element) => {
    for (const child of node.children)
      if (child.type === 'element') {
        if (child.tagName === 'img' && typeof child.properties.src === 'string') {
          const link = resolveBookLink(path, child.properties.src);
          if (link) selected.add(link.path);
        }
        visit(child);
      }
  };
  if (tree) visit(tree);
  return [...selected].sort();
}
function imageMime(path: string) {
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
  };
  return types[path.split('.').at(-1)!.toLowerCase()] ?? 'application/octet-stream';
}

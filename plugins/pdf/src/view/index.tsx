import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Annotation } from '@leaf/contracts/annotations';
import type { ViewCommands, ViewPosition, ReadingAppearance } from '@leaf/contracts/reader';
import type { JsonObject } from '@leaf/shared/types';
import { Store } from '@leaf/shared/events';
import { mountReact } from '@leaf/plugin-sdk/react';
import type { ViewFactory, ViewMountContext } from '@leaf/plugin-sdk/view';
import { PDFHandle } from '../document/provider';
import { pdfLocation, pdfLocator, renderedMarks } from '../document/locators';
import { PDFViewport, type PDFViewportHandle } from './PDFViewport';
import type { ReadingLayout, ReadingLocation } from '../types';
import { parseLayout, pageStep } from './layout';
import { clampZoom } from './zoom';

interface ViewState {
  settings: JsonObject;
  appearance: ReadingAppearance;
  annotations: Annotation[];
  activeId: string | null;
  query: string;
  hit: { page: number; offset: number } | null;
  jump: ReadingLocation & { revision: number };
}

export const pdfView: ViewFactory = {
  id: 'leaf.pdf.view',
  providerId: 'leaf.pdf.document',
  async mount(context) {
    if (!(context.document instanceof PDFHandle)) throw new Error('PDF 视图缺少对应文档');
    const document = context.document;
    const initial =
      context.position && document.locators.validate(context.position.locator)
        ? locationOf(context.position)
        : { page: 1, ratio: 0 };
    const state = new Store<ViewState>({
      settings: context.position?.settings ?? { zoom: 1, continuous: true, spread: false },
      appearance: context.appearance,
      annotations: [],
      activeId: null,
      query: '',
      hit: null,
      jump: { ...initial, revision: 0 },
    });
    let viewer: PDFViewportHandle | null = null,
      closed = false;
    const capture = (): ViewPosition => {
      const location = viewer?.capture() ?? state.get().jump;
      return {
        locator: pdfLocator(document.metadata, location),
        settings: state.get().settings,
        viewport: {
          ratio: location.ratio,
          xRatio: location.xRatio ?? 0,
          screenY: location.screenY ?? 24,
        },
      };
    };
    const jump = (location: ReadingLocation) =>
      state.update((value) => ({
        ...value,
        jump: { ...location, revision: value.jump.revision + 1 },
      }));
    const emitPosition = (location: ReadingLocation) => {
      context.emit({
        type: 'position',
        position: {
          locator: pdfLocator(document.metadata, location),
          settings: state.get().settings,
          viewport: {
            ratio: location.ratio,
            xRatio: location.xRatio ?? 0,
            screenY: location.screenY ?? 24,
          },
        },
        progress: {
          fraction: location.page / document.pdf.numPages,
          ordinal: location.page,
          total: document.pdf.numPages,
          label: `${location.page} / ${document.pdf.numPages}`,
        },
      });
      context.emit({ type: 'ready' });
    };
    const mounted = mountReact(
      context.container,
      <View
        context={context}
        document={document}
        state={state}
        viewer={(value) => {
          viewer = value;
        }}
        onPosition={emitPosition}
      />,
      { onError: (error) => context.emit({ type: 'error', message: String(error) }) },
    );
    const commands: ViewCommands = {
      capabilities: {
        selection: true,
        annotations: true,
        settings: [
          {
            id: 'zoom',
            label: '缩放',
            kind: 'number',
            group: 'scale',
            min: 0.5,
            max: 2,
            step: 0.1,
            default: 1,
          },
          { id: 'continuous', label: '连续滚动', kind: 'boolean', group: 'layout', default: true },
          { id: 'spread', label: '双页', kind: 'boolean', group: 'layout', default: false },
        ],
      },
      capturePosition: capture,
      async restorePosition(position) {
        if (!document.locators.validate(position.locator)) throw new Error('无效的 PDF 位置');
        state.update((value) => ({ ...value, settings: position.settings }));
        jump(locationOf(position));
      },
      async navigate(locator) {
        if (!document.locators.validate(locator)) throw new Error('无效的 PDF 位置');
        jump({ ...pdfLocation(locator), screenY: 32 });
      },
      async turn(direction) {
        const location = pdfLocation(capture().locator);
        jump({
          page: Math.max(
            1,
            Math.min(
              document.pdf.numPages,
              location.page + pageStep(parseLayout(state.get().settings)) * direction,
            ),
          ),
          ratio: 0,
        });
      },
      setSettings(settings) {
        const anchor = capture();
        state.update((value) => ({ ...value, settings: { ...value.settings, ...settings } }));
        jump(locationOf(anchor));
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
        state.update((value) => ({
          ...value,
          query,
          hit: hit ? { page: pdfLocation(hit).page, offset: pdfLocation(hit).offset ?? 0 } : null,
        }));
      },
      clearSelection() {
        window.getSelection()?.removeAllRanges();
        context.emit({ type: 'selection', selection: null });
      },
      dispose() {
        if (closed) return;
        closed = true;
        mounted.dispose();
      },
    };
    return commands;
  },
};

function locationOf(position: ViewPosition): ReadingLocation {
  return {
    ...pdfLocation(position.locator),
    ratio: Number(position.viewport.ratio) || 0,
    xRatio: Number(position.viewport.xRatio) || 0,
    screenY: Number(position.viewport.screenY) || 24,
  };
}
function View({
  context,
  document,
  state,
  viewer,
  onPosition,
}: {
  context: ViewMountContext;
  document: PDFHandle;
  state: Store<ViewState>;
  viewer(value: PDFViewportHandle | null): void;
  onPosition(location: ReadingLocation): void;
}) {
  const value = useSyncExternalStore(state.subscribe, state.get, state.get);
  useEffect(() => {
    const container = context.container;
    const scroll = () => context.emit({ type: 'selection', selection: null });
    container.addEventListener('scroll', scroll, { passive: true });
    return () => container.removeEventListener('scroll', scroll);
  }, [context]);
  const layout: ReadingLayout = useMemo(() => parseLayout(value.settings), [value.settings]);
  const navigate = useCallback(
    (page: number, location?: ReadingLocation) => {
      void context
        .navigate(pdfLocator(document.metadata, location ?? { page, ratio: 0 }))
        .catch((error) => context.notify(String(error)));
    },
    [context, document],
  );
  const markClick = useCallback(
    (mark: { id: string; x: number; y: number } | null) =>
      context.emit({
        type: 'annotation',
        id: mark?.id ?? null,
        ...(mark ? { point: { x: mark.x, y: mark.y } } : {}),
      }),
    [context],
  );
  const selection = useCallback(
    (selection: import('./selection').DocumentSelection | null) =>
      context.emit({
        type: 'selection',
        selection: selection
          ? {
              quote: selection.quote,
              anchors: selection.anchors.map((anchor) =>
                pdfLocator(document.metadata, {
                  page: anchor.page,
                  offset: anchor.start,
                  end: anchor.end,
                  rects: anchor.rects,
                }),
              ),
            }
          : null,
        ...(selection ? { point: { x: selection.x, y: selection.y } } : {}),
      }),
    [context, document],
  );
  const error = useCallback(
    (message: string) => context.emit({ type: 'error', message }),
    [context],
  );
  const marks = useMemo(
    () => renderedMarks(value.annotations, document.metadata, document.pdf.numPages),
    [value.annotations, document],
  );
  return (
    <PDFViewport
      container={context.container}
      ref={viewer}
      pdf={document.pdf}
      getContent={document.getContent}
      marks={marks}
      activeMarkId={value.activeId}
      zoom={clampZoom(Number(value.settings.zoom) || 1)}
      layout={layout}
      dark={value.appearance.theme === 'dark' && !value.appearance.originalColors}
      query={value.query}
      activeMatch={value.hit}
      jump={value.jump}
      onLocation={onPosition}
      onNavigate={navigate}
      onMarkClick={markClick}
      onSelection={selection}
      onError={error}
    />
  );
}

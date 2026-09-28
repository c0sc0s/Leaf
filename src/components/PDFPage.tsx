import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Annotation, PageContent } from '../types';
import { colors } from '../lib/export';
import { captureSelection, type SelectionAnchor } from '../lib/selection';
import { Spinner } from './UI';

type Viewport = ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['getViewport']>;
interface Frame {
  scrollTop: number;
  scrollLeft: number;
  page: number;
  content: PageContent;
  viewport: Viewport;
  canvas: HTMLCanvasElement;
  layer: HTMLDivElement;
}
export function PDFPage({
  pdf,
  page,
  content,
  marks,
  zoom,
  dark,
  onSelection,
  onError,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  content: PageContent;
  marks: Annotation[];
  zoom: number;
  dark: boolean;
  onSelection: (a: SelectionAnchor | null) => void;
  onError: (message: string) => void;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const previous = useRef<Frame | null>(null);
  const [width, setWidth] = useState(0);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [loading, setLoading] = useState(true);
  useLayoutEffect(() => {
    const element = outer.current!;
    const measure = () => {
      const style = getComputedStyle(element);
      setWidth(
        Math.max(
          260,
          element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!width || content.page !== page) return;
    let disposed = false;
    let render: RenderTask | undefined;
    let text: TextLayer | undefined;
    setLoading(true);
    async function draw() {
      try {
        const p = await pdf.getPage(page);
        if (disposed) return;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: (Math.min(width, 1000) / base.width) * zoom });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        // Render offscreen so a slow page never clears the last complete frame.
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';
        const layer = document.createElement('div');
        layer.className = 'textLayer';
        layer.style.setProperty('--scale-factor', String(viewport.scale));
        layer.style.setProperty('--total-scale-factor', String(viewport.scale));
        layer.style.setProperty('--user-unit', '1');
        render = p.render({
          canvas,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await render.promise;
        if (disposed) return;
        if (content.source === 'text') {
          const source = await p.getTextContent();
          if (disposed) return;
          text = new TextLayer({ textContentSource: source, container: layer, viewport });
          await text.render();
          if (disposed) return;
          const original = [...content.tokens].sort((a, b) => a.originalIndex - b.originalIndex);
          let cursor = 0;
          for (const span of text.textDivs) {
            const str = span.textContent || '';
            const token = original.slice(cursor).find((t) => t.text === str);
            if (token) {
              span.dataset.start = String(token.start);
              cursor = original.indexOf(token) + 1;
            }
          }
        } else {
          for (const token of content.tokens) {
            const span = document.createElement('span');
            span.textContent = token.text;
            span.dataset.start = String(token.start);
            Object.assign(span.style, {
              left: token.x * viewport.scale + 'px',
              top: token.y * viewport.scale + 'px',
              fontSize: token.height * viewport.scale + 'px',
              fontFamily: 'sans-serif',
            });
            layer.appendChild(span);
          }
        }
        if (!disposed) {
          setFrame({
            page,
            content,
            viewport,
            canvas,
            layer,
            scrollTop: outer.current?.parentElement?.scrollTop || 0,
            scrollLeft: outer.current?.parentElement?.scrollLeft || 0,
          });
          setLoading(false);
        }
      } catch (error) {
        if (!disposed) {
          setLoading(false);
          onError(error instanceof Error ? error.message : '无法渲染此页');
        }
      }
    }
    void draw();
    return () => {
      disposed = true;
      render?.cancel();
      text?.cancel();
    };
  }, [pdf, page, content, width, zoom, onError]);
  useLayoutEffect(() => {
    if (!frame || !visual.current || !outer.current) return;
    const scroller = outer.current.parentElement!;
    const old = previous.current;
    visual.current.replaceChildren(frame.canvas, frame.layer);
    if (old && old.page === frame.page) {
      const scale = frame.viewport.width / old.viewport.width;
      const padding = parseFloat(getComputedStyle(outer.current).paddingTop);
      scroller.scrollTop = Math.max(0, (frame.scrollTop - padding) * scale + padding);
      scroller.scrollLeft = frame.scrollLeft * scale;
    } else scroller.scrollTo(0, 0);
    previous.current = frame;
  }, [frame]);
  const rects = useMemo(
    () =>
      !frame || frame.page !== page
        ? []
        : marks.flatMap((mark) =>
            mark.rects.map((r) => {
              const v = [
                ...frame.viewport.convertToViewportPoint(r[0], r[1]),
                ...frame.viewport.convertToViewportPoint(r[2], r[3]),
              ];
              return {
                mark,
                rect: [
                  Math.min(v[0], v[2]),
                  Math.min(v[1], v[3]),
                  Math.abs(v[2] - v[0]),
                  Math.abs(v[3] - v[1]),
                ],
              };
            }),
          ),
    [frame, page, marks],
  );
  const pending = loading || frame?.page !== page;
  return (
    <div className="pdf-stage" ref={outer} aria-busy={pending}>
      {!frame && <Spinner text="正在绘制书页…" />}
      {frame && (
        <>
          {pending && <div className="page-render-progress" aria-label="正在准备页面" />}
          <div
            className={`pdf-paper ${dark ? 'dark-paper' : ''}`}
            ref={wrapper}
            data-page={frame.page}
            aria-busy={pending}
            style={{ width: frame.viewport.width, height: frame.viewport.height }}
            onMouseUp={() => {
              if (!wrapper.current || pending) return;
              const anchor = captureSelection(wrapper.current, frame.content);
              const selected = window.getSelection();
              if (anchor && selected?.rangeCount) {
                const box = wrapper.current.getBoundingClientRect();
                anchor.rects = Array.from(selected.getRangeAt(0).getClientRects())
                  .filter((r) => r.width > 0.5 && r.height > 0.5)
                  .map((r) => {
                    const a = frame.viewport.convertToPdfPoint(
                      r.left - box.left,
                      r.bottom - box.top,
                    );
                    const b = frame.viewport.convertToPdfPoint(r.right - box.left, r.top - box.top);
                    return [
                      Math.min(a[0], b[0]),
                      Math.min(a[1], b[1]),
                      Math.max(a[0], b[0]),
                      Math.max(a[1], b[1]),
                    ];
                  });
              }
              onSelection(anchor);
            }}
          >
            <div className="pdf-visual" ref={visual} />
            <svg
              className="annotation-overlay"
              width={frame.viewport.width}
              height={frame.viewport.height}
            >
              {rects.map(({ mark, rect }, i) =>
                mark.kind === 'highlight' ? (
                  <rect
                    key={mark.id + i}
                    x={rect[0]}
                    y={rect[1]}
                    width={rect[2]}
                    height={rect[3]}
                    fill={colors[mark.color]}
                    opacity=".38"
                  />
                ) : (
                  <line
                    key={mark.id + i}
                    x1={rect[0]}
                    y1={rect[1] + rect[3]}
                    x2={rect[0] + rect[2]}
                    y2={rect[1] + rect[3]}
                    stroke={colors[mark.color]}
                    strokeWidth="2"
                  />
                ),
              )}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}

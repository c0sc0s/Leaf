import { useEffect, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Annotation, PageContent } from '../types';
import { colors } from '../lib/export';
import { captureSelection, type SelectionAnchor } from '../lib/selection';
import { Spinner } from './UI';
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
  const viewportRef = useRef<ReturnType<
    Awaited<ReturnType<PDFDocumentProxy['getPage']>>['getViewport']
  > | null>(null);
  const outer = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(740);
  const [size, setSize] = useState({ width: 595, height: 842 });
  const [rects, setRects] = useState<{ mark: Annotation; rect: number[] }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(260, entries[0].contentRect.width - 72)),
    );
    if (outer.current) observer.observe(outer.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false;
    let render: RenderTask | undefined;
    let text: TextLayer | undefined;
    setLoading(true);
    async function draw() {
      try {
        const p = await pdf.getPage(page);
        if (disposed || !canvas.current || !layer.current) return;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: (Math.min(width, 860) / base.width) * zoom });
        viewportRef.current = viewport;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const c = canvas.current;
        setSize({ width: viewport.width, height: viewport.height });
        c.width = Math.ceil(viewport.width * ratio);
        c.height = Math.ceil(viewport.height * ratio);
        c.style.width = viewport.width + 'px';
        c.style.height = viewport.height + 'px';
        layer.current.replaceChildren();
        layer.current.style.setProperty('--scale-factor', String(viewport.scale));
        layer.current.style.setProperty('--total-scale-factor', String(viewport.scale));
        layer.current.style.setProperty('--user-unit', '1');
        render = p.render({
          canvas: c,
          viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        await render.promise;
        if (disposed) return;
        if (content.source === 'text') {
          text = new TextLayer({
            textContentSource: await p.getTextContent(),
            container: layer.current,
            viewport,
          });
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
        } else
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
            layer.current.appendChild(span);
          }
        if (!disposed) {
          setRects(
            marks.flatMap((mark) =>
              mark.rects.map((r) => {
                const v = [
                  ...viewport.convertToViewportPoint(r[0], r[1]),
                  ...viewport.convertToViewportPoint(r[2], r[3]),
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
          );
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
  }, [pdf, page, content, width, zoom, marks, onError]);
  return (
    <div className="pdf-stage" ref={outer}>
      {loading && (
        <div className="page-loading">
          <Spinner text="正在绘制书页…" />
        </div>
      )}
      <div
        className={`pdf-paper ${dark ? 'dark-paper' : ''}`}
        ref={wrapper}
        style={{ width: size.width, height: size.height }}
        onMouseUp={() => {
          if (!wrapper.current) return;
          const anchor = captureSelection(wrapper.current, content);
          const selected = window.getSelection();
          if (anchor && selected?.rangeCount && viewportRef.current) {
            const box = wrapper.current.getBoundingClientRect();
            anchor.rects = Array.from(selected.getRangeAt(0).getClientRects())
              .filter((r) => r.width > 0.5 && r.height > 0.5)
              .map((r) => {
                const p1 = viewportRef.current!.convertToPdfPoint(
                    r.left - box.left,
                    r.bottom - box.top,
                  ),
                  p2 = viewportRef.current!.convertToPdfPoint(r.right - box.left, r.top - box.top);
                return [
                  Math.min(p1[0], p2[0]),
                  Math.min(p1[1], p2[1]),
                  Math.max(p1[0], p2[0]),
                  Math.max(p1[1], p2[1]),
                ];
              });
          }
          onSelection(anchor);
        }}
      >
        <canvas ref={canvas} />
        <svg className="annotation-overlay" width={size.width} height={size.height}>
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
        <div ref={layer} className="textLayer" />
      </div>
      <div className="page-caption">
        {page} <span>/</span> {pdf.numPages}
      </div>
    </div>
  );
}

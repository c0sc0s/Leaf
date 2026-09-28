import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TextLayer } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask, PageViewport } from 'pdfjs-dist';
import type { Annotation, PageContent } from '../../../types';
import { colors } from '../../../lib/export';
import type { PageText } from '../../../lib/selection';
import type { Destination } from '../../../lib/destination';
interface Frame extends PageText {
  canvas: HTMLCanvasElement;
  layer: HTMLDivElement;
}
export function PDFPage({
  pdf,
  page,
  content,
  width,
  marks,
  dark,
  query,
  activeMarkId,
  activeOffset,
  onDestination,
  onReady,
  onError,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  content: PageContent;
  width: number;
  marks: Annotation[];
  activeMarkId: string | null;
  dark: boolean;
  query: string;
  activeOffset?: number;
  onDestination: (destination: Destination) => void;
  onReady: (page: number, frame: PageText) => void;
  onError: (message: string) => void;
}) {
  const visual = useRef<HTMLDivElement>(null);
  const renderWidth = useSettled(width, 140);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [links, setLinks] = useState<{ rect: number[]; dest: string | unknown[] }[]>([]);
  useEffect(() => {
    let disposed = false;
    void pdf
      .getPage(page)
      .then((p) => p.getAnnotations())
      .then((items) => {
        if (!disposed) setLinks(items.filter((a) => a.subtype === 'Link' && a.dest));
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, [pdf, page]);
  useEffect(() => {
    let disposed = false;
    let render: RenderTask | undefined;
    let text: TextLayer | undefined;
    void (async () => {
      try {
        const p = await pdf.getPage(page);
        if (disposed) return;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: renderWidth / base.width });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
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
        const source = await p.getTextContent();
        if (disposed) return;
        text = new TextLayer({ textContentSource: source, container: layer, viewport });
        await text.render();
        if (disposed) return;
        const original = [...content.tokens].sort((a, b) => a.originalIndex - b.originalIndex);
        let cursor = 0;
        for (const span of text.textDivs) {
          const token = original.slice(cursor).find((t) => t.text === span.textContent);
          if (token) {
            span.dataset.start = String(token.start);
            cursor = original.indexOf(token) + 1;
          }
        }
        setFrame({ content, viewport, canvas, layer });
      } catch (error) {
        if (!disposed) onError(error instanceof Error ? error.message : '无法渲染此页');
      }
    })();
    return () => {
      disposed = true;
      render?.cancel();
      text?.cancel();
    };
  }, [pdf, page, content, renderWidth, onError]);
  useLayoutEffect(() => {
    if (!frame || !visual.current) return;
    // Commit the canvas and selectable text together; retain the previous frame during rendering.
    visual.current.replaceChildren(frame.canvas, frame.layer);
    onReady(page, frame);
  }, [frame, page, onReady]);
  const [searchRects, setSearchRects] = useState<{ rect: number[]; active: boolean }[]>([]);
  useLayoutEffect(() => {
    if (!frame || !query.trim()) {
      setSearchRects([]);
      return;
    }
    const result: { rect: number[]; active: boolean }[] = [];
    const box = frame.layer.getBoundingClientRect();
    for (const span of frame.layer.querySelectorAll<HTMLElement>('[data-start]')) {
      const value = span.textContent || '';
      let index = value.toLowerCase().indexOf(query.toLowerCase());
      while (index >= 0 && span.firstChild) {
        const range = document.createRange();
        range.setStart(span.firstChild, index);
        range.setEnd(span.firstChild, index + query.length);
        for (const r of range.getClientRects())
          result.push({
            rect: [r.left - box.left, r.top - box.top, r.width, r.height],
            active: Number(span.dataset.start) + index === activeOffset,
          });
        index = value.toLowerCase().indexOf(query.toLowerCase(), index + query.length);
      }
    }
    setSearchRects(result);
  }, [frame, query, activeOffset]);
  const pending = !frame || Math.abs(frame.viewport.width - width) > 0.1;
  return (
    <div
      className={`pdf-paper ${dark ? 'dark-paper' : ''}`}
      data-page={page}
      aria-busy={pending}
      style={{ width: '100%', height: '100%' }}
    >
      {!frame && <span className="page-placeholder">{page}</span>}
      <div
        className="pdf-frame"
        style={
          frame
            ? {
                width: frame.viewport.width,
                height: frame.viewport.height,
                transform: `scale(${width / frame.viewport.width})`,
              }
            : undefined
        }
      >
        <div className="pdf-visual" ref={visual} />
        {frame && (
          <svg
            className="annotation-overlay"
            width={frame.viewport.width}
            height={frame.viewport.height}
          >
            {marks.map((mark) => (
              <g
                key={mark.id}
                data-mark-id={mark.id}
                data-kind={mark.kind}
                className={mark.id === activeMarkId ? 'active-mark' : undefined}
                opacity={mark.kind === 'highlight' ? 0.38 : 1}
              >
                {mark.rects.map((r, i) => {
                  const v = pdfRect(frame.viewport, r);
                  return mark.kind === 'highlight' ? (
                    <rect
                      key={i}
                      x={v[0]}
                      y={v[1]}
                      width={v[2]}
                      height={v[3]}
                      fill={colors[mark.color]}
                    />
                  ) : (
                    <line
                      key={i}
                      x1={v[0]}
                      y1={v[1] + v[3]}
                      x2={v[0] + v[2]}
                      y2={v[1] + v[3]}
                      stroke={colors[mark.color]}
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            ))}
            <g fill="#e7bd5f" className="search-matches">
              {searchRects.map(({ rect: r, active }, i) => (
                <rect
                  key={i}
                  className={active ? 'current-search-match' : ''}
                  opacity={active ? 0.65 : 0.28}
                  x={r[0]}
                  y={r[1]}
                  width={r[2]}
                  height={r[3]}
                />
              ))}
            </g>
          </svg>
        )}
        {frame &&
          links.map((link, i) => {
            const r = pdfRect(frame.viewport, link.rect);
            return (
              <button
                key={i}
                className="pdf-link"
                aria-label="跳转文档链接"
                title="跳转文档链接"
                style={{ left: r[0], top: r[1], width: r[2], height: r[3] }}
                onClick={() => onDestination(link.dest)}
              />
            );
          })}
      </div>
    </div>
  );
}
// While resizing or zooming, the previous frame is scaled; re-render only once the width stops changing.
function useSettled(value: number, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (settled === value) return;
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, settled, delay]);
  return settled;
}
function pdfRect(viewport: PageViewport, r: number[]) {
  const a = viewport.convertToViewportPoint(r[0], r[1]),
    b = viewport.convertToViewportPoint(r[2], r[3]);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
}

import { useRef } from 'react';
import { Info, ArrowUpRight } from 'lucide-react';
import type { Annotation, DocumentContent, Settings } from '../types';
import { captureDocumentSelection, type DocumentSelection } from '../lib/selection';
import { colors } from '../lib/export';
function MarkedText({
  text,
  start,
  marks,
  query,
}: {
  text: string;
  start: number;
  marks: Annotation[];
  query: string;
}) {
  const end = start + text.length;
  const visible = marks.filter((m) => m.end > start && m.start < end);
  const boundaries = new Set([start, end]);
  visible.forEach((m) => {
    boundaries.add(Math.max(start, m.start));
    boundaries.add(Math.min(end, m.end));
  });
  const searches: { start: number; end: number }[] = [];
  if (query) {
    let index = text.toLowerCase().indexOf(query.toLowerCase());
    while (index >= 0) {
      searches.push({ start: start + index, end: start + index + query.length });
      boundaries.add(start + index);
      boundaries.add(start + index + query.length);
      index = text.toLowerCase().indexOf(query.toLowerCase(), index + Math.max(1, query.length));
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  return (
    <>
      {points.slice(0, -1).map((a, i) => {
        const b = points[i + 1];
        const mark = visible.find((m) => m.start <= a && m.end >= b);
        const search = searches.some((s) => s.start <= a && s.end >= b);
        return (
          <span
            key={a}
            data-start={a}
            className={search ? 'search-match' : ''}
            style={
              mark
                ? mark.kind === 'highlight'
                  ? { background: colors[mark.color] + '66', borderRadius: 2 }
                  : {
                      textDecoration: 'underline',
                      textDecorationColor: colors[mark.color],
                      textDecorationThickness: 2,
                      textUnderlineOffset: 4,
                    }
                : undefined
            }
          >
            {text.slice(a - start, b - start)}
          </span>
        );
      })}
    </>
  );
}
export function ReflowPage({
  document,
  marks,
  settings,
  title,
  query,
  onSelection,
  onOriginal,
}: {
  document: DocumentContent;
  marks: Annotation[];
  settings: Settings;
  title: string;
  query: string;
  onSelection: (a: DocumentSelection | null) => void;
  onOriginal: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <div className="reflow-stage">
      <article
        className={`reflow-article font-${settings.font}`}
        style={{
          maxWidth: settings.width,
          fontSize: settings.fontSize,
          lineHeight: settings.lineHeight,
        }}
      >
        <div className="reflow-kicker">
          {title}
          <span>整本统一阅读 · {document.totalPages} 页</span>
        </div>
        <details className="reflow-notice">
          <summary>
            <Info size={14} />
            已完成全书内容检查<span>说明</span>
          </summary>
          <p>
            正文采用统一排版，图片、图形和可定位的复杂内容作为独立图片块保留。原始页码用于定位和核对；所有内容连续阅读。图像保留原始颜色。
          </p>
          <button onClick={onOriginal}>
            整本切回原版 <ArrowUpRight size={13} />
          </button>
        </details>
        <div
          ref={root}
          className="reflow-content"
          onMouseUp={() =>
            root.current && onSelection(captureDocumentSelection(root.current, document.pages))
          }
        >
          {document.pages.map((content) => (
            <section
              key={content.page}
              data-source-page={content.page}
              aria-label={`原始第 ${content.page} 页内容`}
            >
              <span className="source-page-label" aria-hidden="true">
                原始第 {content.page} 页
              </span>
              {content.blocks.map((block, i) => {
                if (block.type === 'figure' && block.image)
                  return (
                    <figure className="reflow-figure" key={i} data-content-kind={block.image.kind}>
                      <img
                        src={block.image.src}
                        alt={block.image.alt}
                        width={block.image.width}
                        height={block.image.height}
                        loading="lazy"
                      />
                    </figure>
                  );
                const children = (
                  <MarkedText
                    text={block.text}
                    start={block.start}
                    marks={marks
                      .filter((m) => m.page === content.page && m.source === content.source)
                      .flatMap((mark) => {
                        if (content.text.slice(mark.start, mark.end).trim() === mark.quote)
                          return [mark];
                        const start = content.text.indexOf(mark.quote);
                        if (start < 0 || content.text.indexOf(mark.quote, start + 1) >= 0)
                          return [];
                        return [{ ...mark, start, end: start + mark.quote.length }];
                      })}
                    query={query}
                  />
                );
                if (block.type === 'heading') {
                  const Tag = `h${Math.max(1, Math.min(6, block.level || 2))}` as
                    'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                  return <Tag key={i}>{children}</Tag>;
                }
                if (block.type === 'quote') return <blockquote key={i}>{children}</blockquote>;
                return (
                  <p
                    className={
                      block.type === 'list'
                        ? 'list-line'
                        : block.type === 'caption'
                          ? 'figure-caption'
                          : ''
                    }
                    key={i}
                  >
                    {children}
                  </p>
                );
              })}
            </section>
          ))}
        </div>
        <footer className="reflow-footer">
          <span>FOLIO · COMFORT READING</span>
          <span>全文完</span>
        </footer>
      </article>
    </div>
  );
}

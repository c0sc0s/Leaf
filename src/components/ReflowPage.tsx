import { useRef } from 'react';
import { ScanText, Info, FileImage, ArrowUpRight } from 'lucide-react';
import type { Annotation, PageContent, Settings } from '../types';
import { captureSelection, type SelectionAnchor } from '../lib/selection';
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
  content,
  marks,
  settings,
  title,
  query,
  onSelection,
  onOCR,
  onOriginal,
  ocrProgress,
}: {
  content: PageContent;
  marks: Annotation[];
  settings: Settings;
  title: string;
  query: string;
  onSelection: (a: SelectionAnchor | null) => void;
  onOCR: () => void;
  onOriginal: () => void;
  ocrProgress: number | null;
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
          {title} <span>第 {content.page} 页</span>
        </div>
        {content.warnings.length > 0 && (
          <details className="reflow-notice">
            <summary>
              <Info size={14} />
              {content.source === 'ocr'
                ? 'OCR 识别文字'
                : content.columns > 1
                  ? '已识别双栏阅读顺序'
                  : content.tagged
                    ? '按 PDF 语义结构重排'
                    : '已重新排版，专注文字'}
              <span>说明</span>
            </summary>
            <p>
              {content.warnings.join(' ')}
              {content.source === 'ocr' && ' OCR 结果可能有识别误差，请对照原版。'}
            </p>
            <button onClick={onOriginal}>
              查看原版 <ArrowUpRight size={13} />
            </button>
          </details>
        )}
        <div
          ref={root}
          className="reflow-content"
          onMouseUp={() => {
            if (root.current) onSelection(captureSelection(root.current, content));
          }}
        >
          {content.blocks.map((block, i) => {
            const children = (
              <MarkedText
                text={block.text}
                start={block.start}
                marks={marks.filter((m) => m.source === content.source)}
                query={query}
              />
            );
            return block.type === 'heading' ? (
              <h2 key={i}>{children}</h2>
            ) : block.type === 'quote' ? (
              <blockquote key={i}>{children}</blockquote>
            ) : (
              <p className={block.type === 'list' ? 'list-line' : ''} key={i}>
                {children}
              </p>
            );
          })}
        </div>
        {!content.blocks.length && (
          <div className="empty-state scan-empty">
            <FileImage size={40} />
            <h3>这页的文字藏在图片里</h3>
            <p>
              使用 OCR，把扫描件转换为可选择、可标注的文字。
              <br />
              中英文模型随应用内置，识别在本机完成。
            </p>
            <button className="primary" onClick={onOCR} disabled={ocrProgress !== null}>
              <ScanText size={17} />
              {ocrProgress !== null ? `正在识别 ${Math.round(ocrProgress * 100)}%` : '识别本页文字'}
            </button>
            <button className="text-button" onClick={onOriginal}>
              先看原版
            </button>
          </div>
        )}
        <footer className="reflow-footer">
          <span>FOLIO · COMFORT READING</span>
          <span>{content.page}</span>
        </footer>
      </article>
    </div>
  );
}

import type { PageContent } from '../types';
import type { PageViewport } from 'pdfjs-dist';
export interface SelectionAnchor {
  start: number;
  end: number;
  quote: string;
  rects: number[][];
  x: number;
  y: number;
}
export interface DocumentSelection extends SelectionAnchor {
  anchors: (SelectionAnchor & { page: number })[];
}
export interface PageText {
  content: PageContent;
  viewport: PageViewport;
}
export function capturePDFSelection(
  root: HTMLElement,
  pages: Map<number, PageText>,
): DocumentSelection | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const anchors: DocumentSelection['anchors'] = [];
  for (const paper of root.querySelectorAll<HTMLElement>('.pdf-paper')) {
    if (!range.intersectsNode(paper) || paper.getAttribute('aria-busy') === 'true') continue;
    const frame = pages.get(Number(paper.dataset.page));
    if (!frame) continue;
    const { content, viewport } = frame;
    const box = paper.getBoundingClientRect();
    const intervals = [...paper.querySelectorAll<HTMLElement>('[data-start]')]
      .filter((span) => range.intersectsNode(span))
      .flatMap((span) => {
        const node = span.firstChild;
        if (node?.nodeType !== Node.TEXT_NODE) return [];
        const base = Number(span.dataset.start);
        const start = range.startContainer === node ? range.startOffset : 0;
        const end = range.endContainer === node ? range.endOffset : node.textContent!.length;
        if (end <= start) return [];
        const part = document.createRange();
        part.setStart(node, start);
        part.setEnd(node, end);
        const rects = [...part.getClientRects()]
          .filter((r) => r.width > 0.5 && r.height > 0.5)
          .map((r) => {
            const p1 = viewport.convertToPdfPoint(r.left - box.left, r.bottom - box.top);
            const p2 = viewport.convertToPdfPoint(r.right - box.left, r.top - box.top);
            return [
              Math.min(p1[0], p2[0]),
              Math.min(p1[1], p2[1]),
              Math.max(p1[0], p2[0]),
              Math.max(p1[1], p2[1]),
            ];
          });
        return [{ start: base + start, end: base + end, rects }];
      })
      .sort((a, b) => a.start - b.start);
    const merged: typeof intervals = [];
    for (const part of intervals) {
      const last = merged.at(-1);
      if (last && (part.start <= last.end || !content.text.slice(last.end, part.start).trim())) {
        last.end = Math.max(last.end, part.end);
        last.rects.push(...part.rects);
      } else merged.push({ ...part });
    }
    for (const part of merged)
      anchors.push({
        ...part,
        page: content.page,
        quote: content.text.slice(part.start, part.end).trim(),
        x: 0,
        y: 0,
      });
  }
  if (!anchors.length) return null;
  const box = range.getBoundingClientRect();
  return {
    ...anchors[0],
    anchors,
    quote: selection.toString(),
    x: Math.min(window.innerWidth - 340, Math.max(16, box.left + box.width / 2 - 160)),
    y: Math.min(window.innerHeight - 60, Math.max(56, box.top - 54)),
  };
}

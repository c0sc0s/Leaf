import type { PageContent } from '../types';
import { tokenRects } from './reflow';
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
export function captureDocumentSelection(
  root: HTMLElement,
  pages: PageContent[],
): DocumentSelection | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const anchors: DocumentSelection['anchors'] = [];
  for (const section of root.querySelectorAll<HTMLElement>('[data-source-page]')) {
    if (!range.intersectsNode(section)) continue;
    const content = pages.find((p) => p.page === Number(section.dataset.sourcePage));
    if (!content) continue;
    const spans = [...section.querySelectorAll<HTMLElement>('[data-start]')];
    const selected = spans.filter((span) => range.intersectsNode(span));
    if (!selected.length) continue;
    const first = selected[0],
      last = selected[selected.length - 1];
    const start = first.contains(range.startContainer)
      ? offset(range.startContainer, range.startOffset)
      : Number(first.dataset.start);
    const end = last.contains(range.endContainer)
      ? offset(range.endContainer, range.endOffset)
      : Number(last.dataset.start) + (last.textContent?.length || 0);
    if (start === null || end === null || end <= start) continue;
    anchors.push({
      page: content.page,
      start,
      end,
      quote: content.text.slice(start, end).trim(),
      rects: tokenRects(content, start, end),
      x: 0,
      y: 0,
    });
  }
  if (!anchors.length) return null;
  const box = range.getBoundingClientRect();
  return {
    ...anchors[0],
    anchors,
    quote: anchors.map((a) => a.quote).join('\n'),
    x: Math.min(window.innerWidth - 310, Math.max(16, box.left + box.width / 2 - 145)),
    y: Math.max(80, box.top - 54),
  };
}
function offset(node: Node, offset: number) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  const span = element?.closest<HTMLElement>('[data-start]');
  if (!span) return null;
  const range = document.createRange();
  range.selectNodeContents(span);
  try {
    range.setEnd(node, offset);
  } catch {
    return null;
  }
  return Number(span.dataset.start) + range.toString().length;
}
export function captureSelection(root: HTMLElement, content: PageContent): SelectionAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = offset(range.startContainer, range.startOffset),
    end = offset(range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const quote = content.text.slice(start, end).trim();
  if (!quote) return null;
  const box = range.getBoundingClientRect();
  return {
    start,
    end,
    quote,
    rects: tokenRects(content, start, end),
    x: Math.min(window.innerWidth - 310, Math.max(16, box.left + box.width / 2 - 145)),
    y: Math.max(80, box.top - 54),
  };
}

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

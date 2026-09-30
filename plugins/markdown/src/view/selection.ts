import type { DocumentSelection } from '../types';
export function captureMarkdownSelection(
  article: HTMLElement,
  page: number,
): DocumentSelection | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!article.contains(range.startContainer) || !article.contains(range.endContainer)) return null;
  if (
    [...article.querySelectorAll('.markdown-code-toolbar')].some((toolbar) =>
      range.intersectsNode(toolbar),
    )
  )
    return null;
  const pieces = [...article.querySelectorAll<HTMLElement>('[data-md-start]')].flatMap((span) => {
    const text = span.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE || !range.intersectsNode(text)) return [];
    const start = range.startContainer === text ? range.startOffset : 0;
    const end = range.endContainer === text ? range.endOffset : text.textContent!.length;
    if (end <= start) return [];
    return [
      { start: Number(span.dataset.mdStart) + start, end: Number(span.dataset.mdStart) + end },
    ];
  });
  if (!pieces.length || !selection.toString().trim()) return null;
  const box = range.getBoundingClientRect();
  const anchor = {
    start: pieces[0].start,
    end: pieces.at(-1)!.end,
    quote: selection.toString(),
    rects: [],
    x: Math.max(16, Math.min(window.innerWidth - 340, box.left + box.width / 2 - 160)),
    y: Math.max(56, Math.min(window.innerHeight - 60, box.top - 54)),
  };
  return { ...anchor, anchors: [{ ...anchor, page }] };
}

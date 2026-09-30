import type { Root, Element, Text, RootContent, ElementContent } from 'hast';
import type { RenderedMark } from '../types';
import { colors } from '@leaf/ui/reading/annotationColors';
import { headingIdFactory } from './markdownOutline';
interface HtmlNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
}
const textOf = (node: HtmlNode): string => node.value || node.children?.map(textOf).join('') || '';
// Assign stable, book-scoped heading IDs. Raw HTML stays disabled in the renderer.
export function headingIds() {
  return (tree: HtmlNode) => {
    const id = headingIdFactory();
    function visit(node: HtmlNode) {
      if (/^h[1-6]$/.test(node.tagName || '')) {
        node.properties = { ...node.properties, id: id(textOf(node)) };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

// Every HAST element needs properties, even a mark with no HTML attributes.
function searchMark(value: string): Element {
  return {
    type: 'element',
    tagName: 'mark',
    properties: {},
    children: [{ type: 'text', value }],
  };
}

export function highlightText(query: string) {
  return () => (tree: HtmlNode) => {
    if (!query.trim()) return;
    const needle = query.trim().toLocaleLowerCase();
    // Match across syntax tokens, so searching "const value" still finds code.
    function markCode(node: HtmlNode) {
      const text = textOf(node).toLocaleLowerCase();
      const matches: [number, number][] = [];
      let index = text.indexOf(needle);
      while (index >= 0) {
        matches.push([index, index + needle.length]);
        index = text.indexOf(needle, index + needle.length);
      }
      let offset = 0;
      function decorate(parent: HtmlNode) {
        parent.children = parent.children?.flatMap((child) => {
          if (child.type !== 'text') {
            decorate(child);
            return [child];
          }
          const value = child.value || '';
          const start = offset;
          offset += value.length;
          const result: HtmlNode[] = [];
          let from = 0;
          for (const [left, right] of matches) {
            if (right <= start || left >= offset) continue;
            const begin = Math.max(0, left - start);
            const end = Math.min(value.length, right - start);
            result.push(
              { type: 'text', value: value.slice(from, begin) },
              searchMark(value.slice(begin, end)),
            );
            from = end;
          }
          result.push({ type: 'text', value: value.slice(from) });
          return result;
        });
      }
      if (matches.length) decorate(node);
    }
    function visit(node: HtmlNode) {
      if (!node.children || node.tagName === 'mark') return;
      if (node.tagName === 'code') {
        markCode(node);
        return;
      }
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const value = child.value;
        const lower = value.toLocaleLowerCase();
        const result: HtmlNode[] = [];
        let from = 0;
        let index = lower.indexOf(needle);
        while (index >= 0) {
          result.push(
            { type: 'text', value: value.slice(from, index) },
            searchMark(value.slice(index, index + needle.length)),
          );
          from = index + needle.length;
          index = lower.indexOf(needle, from);
        }
        result.push({ type: 'text', value: value.slice(from) });
        return result;
      });
    }
    visit(tree);
  };
}

// Offsets refer to rendered text, so Markdown delimiters and code toolbar labels
// never become part of a saved selection. Syntax/search spans don't affect them.
export function annotateMarkdown(marks: RenderedMark[]) {
  return () => (tree: Root) => {
    let offset = 0;
    function visit(parent: Root | Element, inCode = false) {
      const code = inCode || ('tagName' in parent && parent.tagName === 'code');
      const children = (parent.children as RootContent[]).flatMap<RootContent>((node) => {
        if (node.type === 'element') {
          visit(node, code);
          return [node];
        }
        if (node.type !== 'text') return [node];
        // Keep structural whitespace outside text containers untouched (tables etc.).
        if (
          !code &&
          !node.value.trim() &&
          (!('tagName' in parent) ||
            /^(table|thead|tbody|tr|ul|ol|blockquote)$/.test(parent.tagName))
        )
          return [node];
        if (parent.type === 'root') return [node];
        const start = offset;
        offset += node.value.length;
        const relevant = marks.filter((mark) => mark.start < offset && mark.end > start);
        const boundaries = [
          ...new Set([
            start,
            offset,
            ...relevant.flatMap((mark) => [
              Math.max(start, mark.start),
              Math.min(offset, mark.end),
            ]),
          ]),
        ].sort((a, b) => a - b);
        return boundaries.slice(0, -1).map((left, index): Element => {
          const right = boundaries[index + 1];
          const mark = [...relevant]
            .reverse()
            .find((entry) => entry.start <= left && entry.end >= right);
          return {
            type: 'element',
            tagName: 'span',
            properties: {
              'data-md-start': left,
              'data-md-end': right,
              ...(mark
                ? {
                    'data-mark-id': mark.id,
                    'data-kind': mark.kind,
                    className: ['markdown-annotation'],
                    style: `--annotation-color: ${colors[mark.color]}`,
                  }
                : {}),
            },
            children: [
              { type: 'text', value: node.value.slice(left - start, right - start) } as Text,
            ],
          };
        });
      });
      if (parent.type === 'root') parent.children = children;
      else parent.children = children as ElementContent[];
    }
    visit(tree);
  };
}

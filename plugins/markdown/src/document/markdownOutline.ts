import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { MarkdownChapter } from '../types';

export interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  children?: MarkdownNode[];
}

export function headingIdFactory() {
  const counts = new Map<string, number>();
  return (title: string) => {
    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = counts.get(slug) || 0;
    counts.set(slug, count + 1);
    return 'md-' + slug + (count ? '-' + count : '');
  };
}

export interface MarkdownOutlineItem {
  title: string;
  page: number;
  depth: number;
  hash: string;
}

const parser = unified().use(remarkParse).use(remarkGfm);
const titleOf = (node: MarkdownNode): string =>
  node.type === 'html' ? '' : node.value || node.children?.map(titleOf).join('') || '';

export function markdownOutline(chapters: MarkdownChapter[]): MarkdownOutlineItem[] {
  return chapters.flatMap((chapter, index) =>
    chapterOutline(parser.parse(chapter.content), chapter.title, index + 1),
  );
}

export function chapterOutline(
  tree: MarkdownNode,
  chapterTitle: string,
  page: number,
): MarkdownOutlineItem[] {
  const items: MarkdownOutlineItem[] = [{ title: chapterTitle, page, depth: 0, hash: '' }];
  const id = headingIdFactory();
  const levels: number[] = [];
  let first = true;
  function visit(node: MarkdownNode) {
    if (node.type === 'heading') {
      const title = titleOf(node);
      const hash = id(title);
      // The chapter already represents its opening title.
      const openingTitle = first && title === chapterTitle;
      first = false;
      if (!openingTitle) {
        while (levels.length && levels.at(-1)! >= node.depth!) levels.pop();
        levels.push(node.depth!);
        items.push({ title, page, depth: levels.length, hash });
      }
    }
    node.children?.forEach(visit);
  }
  visit(tree);
  return items;
}

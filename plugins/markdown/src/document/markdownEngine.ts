import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import type { Root } from 'hast';
import type { RenderedMark, MarkdownChapter } from '../types';
import { BoundedCache } from '@leaf/shared/async';
import { chapterOutline, type MarkdownOutlineItem } from './markdownOutline';
import { annotateMarkdown, headingIds, highlightText } from './markdownTransforms';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(headingIds)
  .use(rehypeHighlight, { detect: true });

function treeWeight(node: Root | Root['children'][number]): number {
  return (
    96 +
    ('value' in node ? node.value.length * 2 : 0) +
    ('children' in node ? node.children.reduce((sum, child) => sum + treeWeight(child), 0) : 0)
  );
}

export interface MarkdownSearchResult {
  page: number;
  title: string;
  snippet: string;
  offset: number;
}
export type MarkdownRequest =
  | { type: 'init'; chapters: MarkdownChapter[] }
  | { type: 'outline' }
  | { type: 'render'; page: number; query: string; marks: RenderedMark[] }
  | { type: 'search'; query: string }
  | { type: 'text'; page: number };

export class MarkdownEngine {
  private trees = new BoundedCache<number, Root>(8 * 1024 * 1024, 6);
  private lower = new BoundedCache<number, string>(8 * 1024 * 1024, 5000);
  private outlines = new Map<number, MarkdownOutlineItem[]>();

  constructor(private chapters: MarkdownChapter[]) {}

  render(page: number, query: string, marks: RenderedMark[]): Root {
    const chapter = this.chapters[page - 1];
    if (!chapter) throw new Error('章节不存在');
    let tree = this.trees.get(page);
    if (!tree) {
      const source = processor.parse(chapter.content);
      this.outlines.set(page, chapterOutline(source, chapter.title, page));
      tree = processor.runSync(source) as Root;
      this.trees.set(page, tree, treeWeight(tree));
    }
    // Decorations must never accumulate on the cached syntax tree.
    const decorated = structuredClone(tree);
    highlightText(query)()(decorated);
    annotateMarkdown(marks)()(decorated);
    return decorated;
  }

  async outline(): Promise<MarkdownOutlineItem[]> {
    for (let n = 1; n <= this.chapters.length; n++) {
      if (!this.outlines.has(n)) {
        const chapter = this.chapters[n - 1];
        this.outlines.set(n, chapterOutline(processor.parse(chapter.content), chapter.title, n));
      }
      // Let chapter navigation/search messages run between outline batches.
      if (n % 4 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return this.chapters.flatMap((_, index) => this.outlines.get(index + 1)!);
  }

  text(page: number): string {
    const tree = this.render(page, '', []);
    let result = '';
    function visit(node: Root | Root['children'][number]) {
      if (node.type === 'element' && node.properties['data-md-start'] !== undefined) {
        const child = node.children[0];
        if (child?.type === 'text') result += child.value;
      } else if ('children' in node) node.children.forEach(visit);
    }
    visit(tree);
    return result;
  }

  search(query: string): MarkdownSearchResult[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return this.chapters.flatMap((chapter, index) => {
      const text = this.text(index + 1);
      let lower = this.lower.get(index);
      if (lower === undefined) {
        lower = text.toLocaleLowerCase();
        this.lower.set(index, lower, lower.length);
      }
      const matches: MarkdownSearchResult[] = [];
      let offset = lower.indexOf(needle);
      while (offset >= 0 && matches.length < 1000) {
        matches.push({
          page: index + 1,
          title: chapter.title,
          snippet: text.slice(Math.max(0, offset - 30), offset + 90),
          offset,
        });
        offset = lower.indexOf(needle, offset + needle.length);
      }
      return matches;
    });
  }
}

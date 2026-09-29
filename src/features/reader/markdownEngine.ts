import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeHighlight from 'rehype-highlight';
import type { Root } from 'hast';
import type { Annotation, MarkdownChapter } from '@/types';
import { BoundedCache } from '../../lib/boundedCache';
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
}
export type MarkdownRequest =
  | { type: 'init'; chapters: MarkdownChapter[] }
  | { type: 'outline' }
  | { type: 'render'; page: number; query: string; marks: Annotation[] }
  | { type: 'search'; query: string };

export class MarkdownEngine {
  private trees = new BoundedCache<number, Root>(8 * 1024 * 1024, 6);
  private lower = new BoundedCache<number, string>(8 * 1024 * 1024, 5000);
  private outlines = new Map<number, MarkdownOutlineItem[]>();

  constructor(private chapters: MarkdownChapter[]) {}

  render(page: number, query: string, marks: Annotation[]): Root {
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

  search(query: string): MarkdownSearchResult[] {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return this.chapters.flatMap((chapter, index) => {
      let lower = this.lower.get(index);
      if (lower === undefined) {
        lower = chapter.content.toLocaleLowerCase();
        this.lower.set(index, lower, lower.length);
      }
      const match = lower.indexOf(needle);
      return match < 0
        ? []
        : [
            {
              page: index + 1,
              title: chapter.title,
              snippet: chapter.content.slice(Math.max(0, match - 30), match + 90),
            },
          ];
    });
  }
}

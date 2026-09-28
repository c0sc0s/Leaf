import { describe, expect, it } from 'vitest';
import { markdownOutline } from '../src/features/reader/markdownOutline';

describe('Markdown outline', () => {
  it('parses actual headings, preserves duplicate anchors and normalizes skipped levels', () => {
    const items = markdownOutline([
      {
        path: 'one.md',
        title: 'Chapter',
        content:
          '# Chapter\n\n## **Topic**\n\n#### Deep `code`\n\n## Topic\n\n```md\n# Fake heading\n```\n\nSetext\n------',
      },
      { path: 'two.md', title: 'Next', content: '# Next\n\n## Topic' },
    ]);
    expect(items.map(({ title, depth, hash, page }) => ({ title, depth, hash, page }))).toEqual([
      { title: 'Chapter', depth: 0, hash: '', page: 1 },
      { title: 'Topic', depth: 1, hash: 'md-topic', page: 1 },
      { title: 'Deep code', depth: 2, hash: 'md-deep-code', page: 1 },
      { title: 'Topic', depth: 1, hash: 'md-topic-1', page: 1 },
      { title: 'Setext', depth: 1, hash: 'md-setext', page: 1 },
      { title: 'Next', depth: 0, hash: '', page: 2 },
      { title: 'Topic', depth: 1, hash: 'md-topic', page: 2 },
    ]);
  });
});

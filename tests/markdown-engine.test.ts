import { expect, it } from 'vitest';
import type { Root, Element, Text } from 'hast';
import type { RenderedMark } from '../plugins/markdown/src/types';
import { MarkdownEngine } from '../plugins/markdown/src/document/markdownEngine';

function elements(tree: Root | Element, tag: string): Element[] {
  return tree.children.flatMap((node) =>
    node.type === 'element'
      ? [...(node.tagName === tag ? [node] : []), ...elements(node, tag)]
      : [],
  );
}
const textOf = (node: Root | Element | Text): string =>
  node.type === 'text'
    ? node.value
    : node.children
        .map((child) => (child.type === 'element' || child.type === 'text' ? textOf(child) : ''))
        .join('');

it('reuses parsed syntax without accumulating searches or changing annotation offsets', async () => {
  const engine = new MarkdownEngine([
    {
      path: 'one.md',
      title: 'Chapter',
      content: '# Chapter\n\n## Topic\n\n## Topic\n\n```js\nconst value = 1;\n```',
    },
  ]);
  const plain = engine.render(1, '', []);
  expect(elements(plain, 'h2').map((node) => node.properties.id)).toEqual([
    'md-topic',
    'md-topic-1',
  ]);
  expect(elements(plain, 'code').map(textOf)).toEqual(['const value = 1;\n']);
  const spans = elements(plain, 'span').filter((node) => 'data-md-start' in node.properties);
  const target = spans.find((span) => textOf(span) === 'Chapter')!;
  const mark: RenderedMark = {
    id: 'mark',
    page: 1,
    start: Number(target.properties['data-md-start']),
    end: Number(target.properties['data-md-end']),
    kind: 'highlight',
    color: 'amber',
  };
  const searched = engine.render(1, 'const value', [mark]);
  expect(elements(searched, 'mark').map(textOf)).toEqual(['const', ' value']);
  expect(
    elements(searched, 'span').find((node) => node.properties['data-mark-id'] === 'mark'),
  ).toBeDefined();
  expect(elements(searched, 'code').map(textOf)).toEqual(['const value = 1;\n']);
  const reset = engine.render(1, '', []);
  expect(elements(reset, 'mark')).toEqual([]);
  expect(elements(reset, 'span').some((node) => node.properties['data-mark-id'])).toBe(false);
  expect(await engine.outline()).toHaveLength(3);
  expect(engine.search('VALUE')[0]).toMatchObject({ page: 1, title: 'Chapter' });
  expect(engine.search('   ')).toEqual([]);
});

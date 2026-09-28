import { memo, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import type { Processor } from 'unified';
import type { Root } from 'hast';
import { resolveBookLink } from '@/lib/markdown';
import { MarkdownCodeBlock } from './MarkdownCodeBlock';

// Feed an already processed worker tree through react-markdown's existing safe
// renderer. Its raw-HTML removal and URL filtering still run on every new tree.
function emptyParser(this: Processor) {
  this.parser = () => ({ type: 'root', children: [] });
}
const parsers = [emptyParser];

export const MarkdownContent = memo(function MarkdownContent({
  tree,
  path,
  assets,
  onLink,
  onImageLoad,
}: {
  tree: Root;
  path: string;
  assets: Record<string, string>;
  onLink: (href: string) => void;
  onImageLoad: () => void;
}) {
  const plugins = useMemo(() => [() => () => tree], [tree]);
  const components = useMemo<Components>(
    () => ({
      pre: MarkdownCodeBlock,
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault();
            if (href) onLink(href);
          }}
        >
          {children}
        </a>
      ),
      img: ({ src, alt, title }) => {
        const link = typeof src === 'string' ? resolveBookLink(path, src) : null;
        const source = link
          ? assets[link.path]
          : typeof src === 'string' && /^https?:\/\//i.test(src)
            ? src
            : undefined;
        return source ? (
          <img src={source} alt={alt || ''} title={title} onLoad={onImageLoad} />
        ) : (
          <span className="markdown-missing-image">[图片：{alt || src}]</span>
        );
      },
    }),
    [path, assets, onLink, onImageLoad],
  );
  return (
    <Markdown remarkPlugins={parsers} rehypePlugins={plugins} components={components} skipHtml />
  );
});

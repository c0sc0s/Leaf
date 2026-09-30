import { memo, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { citedPage, linkCitations } from '@/ai/ask';
import type { DocumentUnit } from '@/ai/document';

const plugins = [remarkGfm];

export const AnswerContent = memo(function AnswerContent({
  markdown,
  unit,
  onCite,
}: {
  markdown: string;
  unit: DocumentUnit;
  onCite: (page: number) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const page = citedPage(href);
        if (page !== null)
          return (
            <button type="button" className="ask-citation" onClick={() => onCite(page)}>
              {children}
            </button>
          );
        return (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (!href || !/^https?:\/\//i.test(href)) return;
              if (window.desktop) void window.desktop.openExternal(href);
              else window.open(href, '_blank', 'noopener,noreferrer');
            }}
          >
            {children}
          </a>
        );
      },
    }),
    [onCite],
  );
  return (
    <div className="ask-answer">
      <Markdown remarkPlugins={plugins} components={components} skipHtml>
        {linkCitations(markdown, unit)}
      </Markdown>
    </div>
  );
});

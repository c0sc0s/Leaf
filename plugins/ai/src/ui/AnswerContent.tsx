import { memo, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Locator } from '@leaf/contracts/documents';
import { citedReference, linkCitations } from '../features/ask/context';
import type { Citation } from '../document-tools';

const plugins = [remarkGfm];
export const AnswerContent = memo(function AnswerContent({
  markdown,
  references,
  onCite,
}: {
  markdown: string;
  references: Citation[];
  onCite: (locator: Locator) => void;
}) {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const id = citedReference(href),
          reference = references.find((entry) => entry.id === id);
        return reference ? (
          <button type="button" className="ask-citation" onClick={() => onCite(reference.locator)}>
            {children}
          </button>
        ) : (
          <span>{children}</span>
        );
      },
    }),
    [references, onCite],
  );
  return (
    <div className="ask-answer">
      <Markdown remarkPlugins={plugins} components={components} skipHtml>
        {linkCitations(markdown, references)}
      </Markdown>
    </div>
  );
});

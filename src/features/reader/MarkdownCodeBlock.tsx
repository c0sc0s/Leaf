import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import type { Element, ElementContent } from 'hast';
import { Button } from '@/components/ui/button';
import { Check, Copy } from '@/components/icons';

function textOf(node: Element | ElementContent): string {
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(textOf).join('') : '';
}

export function MarkdownCodeBlock({
  node,
  children,
  ...props
}: ComponentProps<'pre'> & ExtraProps) {
  const codeNode = node?.children.find(
    (child): child is Element => child.type === 'element' && child.tagName === 'code',
  );
  const code = codeNode ? textOf(codeNode) : '';
  const language = (codeNode?.properties.className as string[] | undefined)
    ?.find((name) => name.startsWith('language-'))
    ?.slice(9);
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');

  useEffect(() => {
    setStatus('idle');
  }, [code]);
  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(code);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  }

  if (!codeNode) return <pre {...props}>{children}</pre>;
  return (
    <div className="markdown-code-block">
      <div className="markdown-code-toolbar" data-not-typeset>
        <span className="markdown-code-language">{language || '代码'}</span>
        <Button
          variant="ghost"
          size="xs"
          className="markdown-code-copy"
          aria-label={status === 'copied' ? '已复制代码' : '复制代码'}
          title={status === 'error' ? '复制失败，请重试或手动选择代码复制' : '复制代码'}
          disabled={status === 'copying'}
          onClick={() => void copy()}
        >
          {status === 'copied' ? <Check size={14} /> : <Copy size={14} />}
          <span aria-live="polite">
            {status === 'copied' ? '已复制' : status === 'error' ? '复制失败，重试' : '复制'}
          </span>
        </Button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}

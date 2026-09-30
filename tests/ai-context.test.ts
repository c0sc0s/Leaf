import { describe, expect, it } from 'vitest';
import { clip, estimateTokens, fitMessages, messageTokens } from '../plugins/ai/src/agent/context';
import { askContext, askMessages, linkCitations } from '../plugins/ai/src/features/ask/context';
import { documentTools, ReferenceCatalog } from '../plugins/ai/src/document-tools';
import { textDocument } from './fixtures/document';
describe('document context', () => {
  it('reads an arbitrary format through the protocol and creates navigable citations', async () => {
    const { document, locator } = textDocument(),
      references = new ReferenceCatalog(document),
      signal = new AbortController().signal;
    const context = await askContext(
      document,
      locator(1),
      'selected attention',
      references,
      signal,
    );
    expect(context).toContain('original passage');
    expect(context).toContain('selected attention');
    const messages = askMessages(context, [{ role: 'user', content: 'Explain' }]);
    expect(messages[1].content).toContain('Explain');
    const tools = documentTools(document, references, locator(1));
    await tools.find((tool) => tool.name === 'search_book')!.run({ query: 'attention' }, signal);
    expect(
      references
        .all()
        .some(
          (reference) =>
            reference.locator.payload && JSON.stringify(reference.locator.payload).includes('2'),
        ),
    ).toBe(true);
    expect(linkCitations('see [ref.1] and [ref.999]', references.all())).toContain(
      '(\u0023leaf-cite-1)',
    );
    expect(linkCitations('[ref.999]', references.all())).toBe('[ref.999]');
    await expect(
      tools.find((tool) => tool.name === 'read_sections')!.run({ from: '1' }, signal),
    ).rejects.toThrow();
  });
  it('bounds prompts including tool schemas and keeps tool calls with their results', () => {
    const messages = [
      { role: 'system' as const, content: 'Rules' },
      { role: 'user' as const, content: 'context '.repeat(10000) },
      { role: 'assistant' as const, content: 'old answer' },
      { role: 'user' as const, content: 'latest question' },
      {
        role: 'assistant' as const,
        content: null,
        tool_calls: [
          { id: 'call', type: 'function' as const, function: { name: 'read', arguments: '{}' } },
        ],
      },
      { role: 'tool' as const, tool_call_id: 'call', content: 'passage '.repeat(1000) },
    ];
    const fitted = fitMessages(messages, [], 1000);
    expect(messageTokens(fitted)).toBeLessThanOrEqual(1000);
    expect(fitted.some((message) => message.content === 'latest question')).toBe(true);
    expect(fitted.at(-2)?.role).toBe('assistant');
    expect(fitted.at(-1)?.role).toBe('tool');
    expect((messages[1].content ?? '').length).toBeGreaterThan(10000);
    expect(estimateTokens('你好')).toBe(2);
    expect(clip('abcdef'.repeat(1000), 30).length).toBeLessThan(150);
  });
});

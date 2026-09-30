import { describe, expect, it } from 'vitest';
import { askContext, askMessages, linkCitations } from '../../../../src/features/ask/context';
import { documentTools, ReferenceCatalog } from '../../../../src/document-tools';
import { textDocument } from '../../../../../../tests/fixtures/document';
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
});

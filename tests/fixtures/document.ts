import type { DocumentHandle, Locator } from '@leaf/contracts/documents';
import type { ReadableSession } from '@leaf/contracts/reader';
export function textDocument() {
  const metadata = {
    id: 'test-document',
    revision: 'revision-1',
    formatId: 'test.text',
    title: 'Example',
    author: '',
    filename: 'example.txt',
    cover: '',
    addedAt: 1,
    openedAt: 0,
    favorite: false,
    progress: { fraction: 0, label: '' },
  };
  const locator = (index: number): Locator => ({
    documentId: metadata.id,
    revision: metadata.revision,
    schema: 'test.text',
    version: 1,
    payload: { index },
  });
  const indexOf = (position: Locator) => (position.payload as { index: number }).index;
  const document: DocumentHandle = {
    metadata,
    locators: {
      validate: (position) =>
        !!position &&
        position.documentId === metadata.id &&
        position.revision === metadata.revision &&
        position.schema === 'test.text' &&
        Number.isInteger(indexOf(position)) &&
        indexOf(position) >= 0 &&
        indexOf(position) < 3,
      label: (position) => `Section ${indexOf(position) + 1}`,
    },
    navigation: { count: 3, locator, index: indexOf, label: (index) => `Section ${index + 1}` },
    content: {
      async read(request, signal) {
        signal.throwIfAborted();
        const position = request.locator ?? locator(0);
        return {
          blocks: [
            {
              id: 'passage',
              kind: 'text',
              text: `Section ${indexOf(position) + 1}: original passage about attention.`,
              locator: position,
            },
          ],
        };
      },
    },
    outline: {
      async read() {
        return [{ id: 'intro', title: 'Introduction', depth: 0, locator: locator(0) }];
      },
    },
    search: {
      async search(_query, options) {
        options.signal.throwIfAborted();
        return [
          {
            id: 'result',
            excerpt: 'Matching original passage',
            locator: locator(2),
            match: { start: 0, end: 8 },
          },
        ];
      },
    },
    dispose() {},
  };
  const controller = new AbortController();
  const session: ReadableSession = {
    id: 'test-session',
    signal: controller.signal,
    document,
    snapshot: () => ({
      id: 'test-session',
      documentId: metadata.id,
      ready: true,
      position: { locator: locator(1), settings: {}, viewport: {} },
      progress: metadata.progress,
      selection: null,
      selectionPoint: null,
      activeAnnotation: null,
      canReturn: false,
      error: null,
    }),
    subscribe: () => ({ dispose() {} }),
    async navigate() {},
    clearSelection() {},
  };
  return { document, locator, session, controller };
}

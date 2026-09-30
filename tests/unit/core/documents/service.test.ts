import { describe, expect, it, vi } from 'vitest';
import type {
  DocumentHandle,
  DocumentProvider,
  DocumentInteractions,
} from '@leaf/contracts/documents';
import { DocumentsService } from '../../../../src/core/documents/service';
import { PluginRegistry } from '../../../../src/core/plugins/registry';
import { textDocument } from '../../../fixtures/document';

function setup() {
  const { document } = textDocument(),
    registry = new PluginRegistry();
  const released = vi.fn(async () => {}),
    closed = vi.fn(async () => {});
  document.dispose = closed;
  const open = vi.fn(async () => document);
  const provider: DocumentProvider = {
    id: 'test.text.document',
    formats: [{ id: 'test.text', label: 'Text', extensions: ['txt'], mimeTypes: ['text/plain'] }],
    probe: async () => 1,
    import: async () => null,
    open,
  };
  registry.register('test.text', 'documentProviders', provider.id, provider);
  const interactions: DocumentInteractions = {
    password: async () => null,
    choose: vi.fn(async (_label, options) => options[0].id),
  };
  const service = new DocumentsService(
    {
      open: async () => ({
        record: { metadata: document.metadata, source: { resources: [], data: {} } },
        readResource: async () => new Uint8Array(),
        dispose: released,
      }),
    },
    registry,
    interactions,
    async () => {},
  );
  return { service, registry, provider, document, released, closed, open, interactions };
}

describe('document provider ownership', () => {
  it('shares one document handle until the final reference closes', async () => {
    const { service, open, closed, released } = setup();
    const [first, second] = await Promise.all([
      service.acquire('test-document'),
      service.acquire('test-document'),
    ]);
    expect(open).toHaveBeenCalledOnce();
    expect(first.document).toBe(second.document);
    await first.dispose();
    await first.dispose();
    expect(closed).not.toHaveBeenCalled();
    await second.dispose();
    expect(closed).toHaveBeenCalledOnce();
    expect(released).toHaveBeenCalledOnce();
  });
  it('releases a document that finishes opening after its caller cancels', async () => {
    const { service, open, closed, released, document } = setup();
    let finish!: (document: DocumentHandle) => void;
    open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController(),
      pending = service.acquire('test-document', controller.signal);
    await vi.waitFor(() => expect(open).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).rejects.toThrow();
    finish(document);
    await vi.waitFor(() => {
      expect(closed).toHaveBeenCalledOnce();
      expect(released).toHaveBeenCalledOnce();
    });
  });
  it('selects competing plugins through the protocol and ignores a broken probe', async () => {
    const { service, registry, provider, interactions } = setup();
    registry.register('test.other', 'documentProviders', 'test.other.document', {
      ...provider,
      id: 'test.other.document',
    });
    registry.register('test.broken', 'documentProviders', 'test.broken.document', {
      ...provider,
      id: 'test.broken.document',
      probe: async () => {
        throw new Error('parse failure');
      },
    });
    expect(
      (await service.importer({ name: 'text.txt', files: [] }, new AbortController().signal))?.id,
    ).toBe(provider.id);
    expect(interactions.choose).toHaveBeenCalledOnce();
    await service.dispose();
  });
});

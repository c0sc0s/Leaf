import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation } from '@leaf/contracts/annotations';
import { AnnotationService } from '../../../../src/core/annotations/service';
import { textDocument } from '../../../fixtures/document';

afterEach(() => vi.useRealTimers());

async function setup() {
  const fixture = textDocument();
  const stored = new Map<string, Annotation>();
  const commit = vi.fn(async (_documentId: string, remove: string[], put: Annotation[]) => {
    for (const id of remove) stored.delete(id);
    for (const mark of put) stored.set(mark.id, structuredClone(mark));
  });
  const service = new AnnotationService(fixture.document.metadata.id, {
    list: async () => [...stored.values()],
    commit,
  });
  await service.initialize();
  const mark: Annotation = {
    id: 'mark',
    documentId: fixture.document.metadata.id,
    targets: [fixture.locator(0), fixture.locator(1)],
    quote: 'Across two sections',
    kind: 'highlight',
    color: 'amber',
    note: '',
    createdAt: 1,
  };
  return { service, stored, commit, mark };
}

describe('host annotation transactions', () => {
  it('publishes a multi-target annotation only after persistence succeeds and waits on flush', async () => {
    const { service, commit, mark } = await setup();
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writing = new Promise<void>((resolve) => {
      started = resolve;
    });
    const persist = commit.getMockImplementation()!;
    commit.mockImplementationOnce(async (...args) => {
      started();
      await blocked;
      await persist(...args);
    });
    const adding = service.add([mark]);
    await writing;
    expect(service.state.get().marks).toEqual([]);
    expect(service.state.get().status).toBe('saving');
    let flushed = false;
    const flushing = service.flush().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    release();
    await Promise.all([adding, flushing]);
    expect(service.state.get().marks).toEqual([mark]);
    expect(service.state.get().undo).toBe(true);
  });

  it('keeps the saved annotation and history after a failed edit and can retry', async () => {
    const { service, commit, stored, mark } = await setup();
    await service.add([mark]);
    commit.mockRejectedValueOnce(new Error('disk full'));
    await expect(service.style(mark.id, { color: 'green' })).rejects.toThrow('disk full');
    expect(service.state.get().marks).toEqual([mark]);
    expect(stored.get(mark.id)).toEqual(mark);
    await expect(service.flush()).rejects.toThrow('disk full');
    await service.style(mark.id, { color: 'green' });
    await expect(service.flush()).resolves.toBeUndefined();
    await service.undo();
    expect(service.state.get().marks).toEqual([mark]);
  });

  it('groups consecutive note edits while keeping style edits and every target reversible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const { service, mark } = await setup();
    await service.add([mark]);
    await service.note(mark.id, 'first');
    vi.setSystemTime(11000);
    await service.note(mark.id, 'final note');
    await service.style(mark.id, { kind: 'underline', color: 'blue' });
    await service.undo();
    expect(service.state.get().marks[0]).toEqual({ ...mark, note: 'final note' });
    await service.undo();
    expect(service.state.get().marks).toEqual([mark]);
    await service.redo();
    await service.redo();
    expect(service.state.get().marks[0]).toEqual({
      ...mark,
      note: 'final note',
      kind: 'underline',
      color: 'blue',
    });
  });

  it('retains undo and redo availability when an undo cannot be saved', async () => {
    const { service, commit, mark } = await setup();
    await service.add([mark]);
    await service.note(mark.id, 'saved note');
    commit.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.undo()).rejects.toThrow('unavailable');
    expect(service.state.get()).toMatchObject({ undo: true, redo: false });
    expect(service.state.get().marks[0].note).toBe('saved note');
    await service.undo();
    expect(service.state.get().marks).toEqual([mark]);
    expect(service.state.get().redo).toBe(true);
    await service.redo();
    expect(service.state.get().marks[0].note).toBe('saved note');
  });
});

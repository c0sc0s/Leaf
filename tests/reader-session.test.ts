import { describe, expect, it, vi } from 'vitest';
import { ReadingSession } from '../src/core/reader/session';
import { AnnotationService } from '../src/core/annotations/service';
import type { Bookmark, ViewCommands, ViewPosition } from '@leaf/contracts/reader';
import { textDocument } from './fixtures/document';
function setup() {
  const fixture = textDocument(),
    saved: ViewPosition[] = [],
    released = vi.fn(async () => {});
  const annotations = new AnnotationService(fixture.document.metadata.id, {
    list: async () => [],
    commit: async () => {},
  });
  const repository = {
    position: async () => null,
    bookmarks: async () => [],
    savePosition: async (_id: string, value: ViewPosition) => {
      saved.push(value);
    },
    putBookmark: vi.fn(async (_bookmark: Bookmark) => {}),
    deleteBookmark: async () => {},
  };
  const session = new ReadingSession(
    {
      pluginId: 'test.reader',
      providerId: 'test.reader.document',
      document: fixture.document,
      dispose: released,
    },
    annotations,
    repository,
    async () => {},
    () => {},
  );
  let position = {
    locator: fixture.locator(0),
    settings: {},
    viewport: { ratio: 0.3 },
  } as ViewPosition;
  const view: ViewCommands = {
    capabilities: { selection: true, annotations: true, settings: [] },
    capturePosition: () => position,
    async restorePosition(value) {
      position = value;
    },
    async navigate(locator) {
      position = { ...position, locator };
    },
    async turn() {},
    setSettings() {},
    setAppearance() {},
    setSearch() {},
    setAnnotations() {},
    clearSelection() {},
    dispose: vi.fn(async () => {}),
  };
  return { ...fixture, session, view, saved, released, repository };
}
describe('shared reading sessions', () => {
  it('ignores events from an old view and disposes a view mounted after cancellation', async () => {
    const { session, view, document } = setup();
    await session.initialize();
    const first = session.bindView(),
      second = session.bindView();
    first.emit({ type: 'ready' });
    expect(session.snapshot().ready).toBe(false);
    await first.attach(view);
    expect(view.dispose).toHaveBeenCalledOnce();
    second.emit({
      type: 'position',
      position: view.capturePosition(),
      progress: document.metadata.progress,
    });
    second.emit({ type: 'ready' });
    expect(session.snapshot().ready).toBe(true);
    await first.dispose();
    await second.dispose();
    await session.dispose();
    expect(view.dispose).toHaveBeenCalledOnce();
  });
  it('persists a precise bookmark and returns from navigation using opaque plugin locations', async () => {
    const { session, view, locator, repository } = setup();
    await session.initialize();
    const binding = session.bindView();
    await binding.attach(view);
    binding.emit({ type: 'ready' });
    await session.toggleBookmark();
    expect(repository.putBookmark.mock.calls[0][0].position.viewport.ratio).toBe(0.3);
    await session.navigate(locator(2));
    expect(session.snapshot().canReturn).toBe(true);
    await session.returnToPrevious();
    expect(view.capturePosition().locator).toEqual(locator(0));
    expect(session.snapshot().canReturn).toBe(false);
    await session.dispose();
  });
  it('rejects foreign anchors and saves the final position before releasing document resources once', async () => {
    const { session, view, locator, saved, released } = setup();
    await session.initialize();
    const binding = session.bindView();
    await binding.attach(view);
    binding.emit({ type: 'ready' });
    binding.emit({
      type: 'selection',
      selection: { quote: 'foreign', anchors: [{ ...locator(0), documentId: 'another-document' }] },
    });
    expect(session.snapshot().selection).toBe(null);
    await session.navigate(locator(1));
    const disposal = session.dispose();
    expect(session.dispose()).toBe(disposal);
    await disposal;
    await binding.dispose();
    expect(view.dispose).toHaveBeenCalledOnce();
    expect(saved.at(-1)?.locator).toEqual(locator(1));
    expect(released).toHaveBeenCalledOnce();
    expect(session.signal.aborted).toBe(true);
  });
  it('keeps the view and resources available after a failed save so closing can be retried', async () => {
    const { session, view, repository, released } = setup();
    await session.initialize();
    const binding = session.bindView();
    await binding.attach(view);
    binding.emit({ type: 'ready' });
    const save = vi
      .spyOn(repository, 'savePosition')
      .mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(session.dispose()).rejects.toThrow('disk unavailable');
    expect(session.signal.aborted).toBe(false);
    expect(view.dispose).not.toHaveBeenCalled();
    expect(released).not.toHaveBeenCalled();
    await session.dispose();
    expect(save).toHaveBeenCalledTimes(2);
    expect(view.dispose).toHaveBeenCalledOnce();
    expect(released).toHaveBeenCalledOnce();
  });
});

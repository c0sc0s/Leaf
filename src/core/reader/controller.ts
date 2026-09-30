import { Store } from '@leaf/shared/events';
import { withSignal } from '@leaf/shared/async';
import type { DocumentsService } from '../documents/service.ts';
import type { AnnotationRepository } from '../annotations/repository.ts';
import { AnnotationService } from '../annotations/service.ts';
import type { ReaderRepository } from './repository.ts';
import { ReadingSession } from './session.ts';
import type { ReadingProgress } from '@leaf/contracts/documents';

export class ReadingController {
  readonly state = new Store<{ active: ReadingSession | null; opening: string | null }>({
    active: null,
    opening: null,
  });
  private pending?: AbortController;
  constructor(
    private documents: DocumentsService,
    private annotations: AnnotationRepository,
    private repository: ReaderRepository,
    private progress: (id: string, progress: ReadingProgress) => Promise<void>,
    private failure: (message: string) => void,
  ) {}
  async open(id: string) {
    this.pending?.abort();
    const controller = new AbortController();
    this.pending = controller;
    await this.closeActive();
    if (controller.signal.aborted) return;
    this.state.set({ active: null, opening: id });
    let session: ReadingSession | undefined;
    try {
      const reference = await this.documents.acquire(id, controller.signal);
      session = new ReadingSession(
        reference,
        new AnnotationService(id, this.annotations),
        this.repository,
        (progress) => this.progress(id, progress),
        this.failure,
      );
      await withSignal(session.initialize(), controller.signal);
      controller.signal.throwIfAborted();
      this.state.set({ active: session, opening: null });
    } catch (error) {
      await session?.dispose();
      if (this.pending === controller) this.state.set({ active: null, opening: null });
      if (!controller.signal.aborted) throw error;
    }
  }
  async close() {
    this.pending?.abort();
    await this.closeActive();
    this.state.set({ active: null, opening: null });
  }
  async closeDocument(id: string) {
    if (this.state.get().active?.document.metadata.id === id || this.state.get().opening === id)
      await this.close();
  }
  async closePlugin(pluginId: string) {
    if (this.state.get().opening || this.state.get().active?.reference.pluginId === pluginId)
      await this.close();
  }
  async flush() {
    await this.state.get().active?.flush();
  }
  private async closeActive() {
    const active = this.state.get().active;
    if (!active) return;
    await active.dispose();
    if (this.state.get().active === active)
      this.state.update((state) => ({ ...state, active: null }));
  }
}

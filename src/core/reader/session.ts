import type { Locator, ReadingProgress } from '@leaf/contracts/documents';
import type { Annotation, MarkColor, MarkKind } from '@leaf/contracts/annotations';
import type {
  Bookmark,
  ReadableSession,
  ReadingSnapshot,
  TextSelection,
  ViewCommands,
  ViewEvent,
  ViewPosition,
} from '@leaf/contracts/reader';
import { Store } from '@leaf/shared/events';
import { SerialQueue } from '@leaf/shared/async';
import type { Disposable } from '@leaf/shared/lifecycle';
import type { DocumentReference } from '../documents/service.ts';
import type { AnnotationService } from '../annotations/service.ts';
import type { ReaderRepository } from './repository.ts';

export interface ViewBinding extends Disposable {
  signal: AbortSignal;
  emit(event: ViewEvent): void;
  attach(view: ViewCommands): Promise<void>;
}

export class ReadingSession implements ReadableSession, Disposable {
  readonly id = crypto.randomUUID();
  private controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly document;
  readonly state: Store<ReadingSnapshot>;
  readonly bookmarks = new Store<Bookmark[]>([]);
  private history: ViewPosition[] = [];
  private view?: ViewCommands;
  private releaseView?: () => Promise<void>;
  private viewController?: AbortController;
  private generation = 0;
  private saves = new SerialQueue();
  private timer?: ReturnType<typeof setTimeout>;
  private subscriptions: Disposable[] = [];
  private closing?: Promise<void>;

  constructor(
    readonly reference: DocumentReference,
    readonly annotations: AnnotationService,
    private repository: ReaderRepository,
    private onProgress: (progress: ReadingProgress) => Promise<void>,
    private onFailure: (message: string) => void,
  ) {
    this.document = reference.document;
    this.state = new Store({
      id: this.id,
      documentId: this.document.metadata.id,
      ready: false,
      position: null,
      progress: this.document.metadata.progress,
      selection: null,
      selectionPoint: null,
      activeAnnotation: null,
      canReturn: false,
      error: null,
    });
    this.subscriptions.push({ dispose: annotations.state.subscribe(() => this.syncMarks()) });
  }
  fail(message: string) {
    this.state.update((state) => ({ ...state, error: message }));
  }
  snapshot = () => this.state.get();
  subscribe(listener: (value: ReadingSnapshot) => void) {
    return { dispose: this.state.subscribe(() => listener(this.state.get())) };
  }

  async initialize() {
    const [position, bookmarks] = await Promise.all([
      this.repository.position(this.document.metadata.id),
      this.repository.bookmarks(this.document.metadata.id),
      this.annotations.initialize(),
    ]);
    this.signal.throwIfAborted();
    this.bookmarks.set(bookmarks);
    if (position && this.valid(position.locator))
      this.state.update((state) => ({ ...state, position }));
  }

  bindView(): ViewBinding {
    const generation = ++this.generation;
    this.viewController?.abort();
    const controller = new AbortController();
    this.viewController = controller;
    const abort = () => controller.abort();
    this.signal.addEventListener('abort', abort, { once: true });
    let mounted: ViewCommands | undefined;
    let releasing: Promise<void> | undefined;
    const release = () =>
      mounted
        ? (releasing ??= Promise.resolve().then(() => mounted!.dispose()))
        : Promise.resolve();
    const current = () => generation === this.generation && !controller.signal.aborted;
    return {
      signal: controller.signal,
      emit: (event) => {
        if (current()) this.receive(event);
      },
      attach: async (view) => {
        mounted = view;
        if (!current()) {
          await release();
          return;
        }
        this.view = view;
        this.releaseView = release;
        this.syncMarks();
        const position = this.state.get().position;
        if (position) await view.restorePosition(position);
      },
      dispose: async () => {
        controller.abort();
        this.signal.removeEventListener('abort', abort);
        if (generation === this.generation) {
          this.view = undefined;
          this.releaseView = undefined;
          this.state.update((state) => ({ ...state, ready: false }));
        }
        await release();
      },
    };
  }

  async navigate(locator: Locator) {
    if (!this.valid(locator) || !this.view) throw new Error('无法跳转到这个位置');
    this.history.push(this.view.capturePosition());
    if (this.history.length > 32) this.history.shift();
    this.state.update((state) => ({ ...state, canReturn: true }));
    this.clearSelection();
    await this.view.navigate(locator);
  }
  async returnToPrevious() {
    const position = this.history.pop();
    if (!position || !this.view) return;
    this.clearSelection();
    await this.view.restorePosition(position);
    this.state.update((state) => ({ ...state, canReturn: !!this.history.length }));
  }
  clearSelection() {
    this.view?.clearSelection();
    this.state.update((state) => ({
      ...state,
      selection: null,
      selectionPoint: null,
      activeAnnotation: null,
    }));
    this.syncMarks();
  }
  setSettings(settings: ViewPosition['settings']) {
    this.view?.setSettings(settings);
  }
  async turn(direction: 1 | -1) {
    this.clearSelection();
    await this.view?.turn(direction);
  }
  setSearch(query: string, hit?: Locator) {
    this.view?.setSearch(query, hit);
  }
  setAppearance(appearance: import('@leaf/contracts/reader').ReadingAppearance) {
    this.view?.setAppearance(appearance);
  }
  capabilities() {
    return this.view?.capabilities;
  }
  async annotate(
    kind: MarkKind,
    color: MarkColor,
    selection = this.state.get().selection,
  ): Promise<Annotation | null> {
    if (
      !selection ||
      !selection.anchors.length ||
      !selection.anchors.every((anchor) => this.valid(anchor))
    )
      return null;
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      documentId: this.document.metadata.id,
      targets: selection.anchors,
      quote: selection.quote,
      kind,
      color,
      note: '',
      createdAt: Date.now(),
    };
    await this.annotations.add([annotation]);
    this.clearSelection();
    return annotation;
  }
  async toggleBookmark() {
    if (!this.view) return;
    const position = this.view.capturePosition();
    const existing = this.bookmarks
      .get()
      .find((entry) => this.sameUnit(entry.position.locator, position.locator));
    if (existing) {
      await this.repository.deleteBookmark(existing.id);
      this.bookmarks.update((items) => items.filter((entry) => entry.id !== existing.id));
    } else {
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        documentId: this.document.metadata.id,
        position,
        title: this.document.locators.label(position.locator),
        createdAt: Date.now(),
      };
      await this.repository.putBookmark(bookmark);
      this.bookmarks.update((items) => [...items, bookmark]);
    }
  }
  bookmarked() {
    const locator = this.state.get().position?.locator;
    return (
      !!locator &&
      this.bookmarks.get().some((entry) => this.sameUnit(entry.position.locator, locator))
    );
  }
  async openBookmark(bookmark: Bookmark) {
    if (this.view) {
      this.history.push(this.view.capturePosition());
      await this.view.restorePosition(bookmark.position);
      this.state.update((state) => ({ ...state, canReturn: true }));
    }
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.view && this.state.get().ready)
      this.state.update((state) => ({ ...state, position: this.view!.capturePosition() }));
    await this.save();
    await this.annotations.flush();
  }
  dispose() {
    if (!this.closing)
      this.closing = (async () => {
        await this.flush();
        this.controller.abort();
        this.viewController?.abort();
        try {
          await this.releaseView?.();
        } finally {
          this.view = undefined;
          this.releaseView = undefined;
          try {
            for (const subscription of this.subscriptions) await subscription.dispose();
          } finally {
            await this.reference.dispose();
          }
        }
      })();
    const closing = this.closing;
    void closing.catch(() => {
      if (!this.signal.aborted && this.closing === closing) this.closing = undefined;
    });
    return this.closing;
  }
  private valid(locator: Locator) {
    return this.document.locators.validate(locator);
  }
  private sameUnit(a: Locator, b: Locator) {
    const navigation = this.document.navigation;
    return navigation
      ? navigation.index(a) === navigation.index(b)
      : JSON.stringify(a) === JSON.stringify(b);
  }
  private syncMarks() {
    this.view?.setAnnotations(
      this.annotations.state.get().marks,
      this.state.get().activeAnnotation?.id ?? null,
    );
  }
  private receive(event: ViewEvent) {
    if (event.type === 'ready') this.state.update((state) => ({ ...state, ready: true }));
    else if (event.type === 'error')
      this.state.update((state) => ({ ...state, error: event.message }));
    else if (event.type === 'position') {
      if (!this.valid(event.position.locator)) return;
      this.state.update((state) => ({
        ...state,
        position: event.position,
        progress: event.progress,
      }));
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.save().catch((error) =>
          this.onFailure(error instanceof Error ? error.message : '阅读位置保存失败'),
        );
      }, 750);
    } else if (event.type === 'selection') {
      const selection: TextSelection | null = event.selection?.anchors.every((anchor) =>
        this.valid(anchor),
      )
        ? event.selection
        : null;
      this.state.update((state) => ({
        ...state,
        selection,
        selectionPoint: event.point ?? null,
        activeAnnotation: null,
      }));
      this.syncMarks();
    } else if (event.type === 'annotation') {
      this.state.update((state) => ({
        ...state,
        activeAnnotation: event.id && event.point ? { id: event.id, point: event.point } : null,
        selection: null,
        selectionPoint: null,
      }));
      this.syncMarks();
    }
  }
  private save() {
    const { position, progress } = this.state.get();
    if (!position) return Promise.resolve();
    return this.saves.enqueue(async () => {
      await this.repository.savePosition(this.document.metadata.id, position);
      await this.onProgress(progress);
    });
  }
}

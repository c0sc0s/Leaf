import type { Annotation, MarkColor, MarkKind } from '@leaf/contracts/annotations';
import type { AnnotationRepository } from './repository.ts';
import { Store } from '@leaf/shared/events';
import { SerialQueue } from '@leaf/shared/async';

interface Edit {
  before: Annotation[];
  after: Annotation[];
  group?: string;
  time: number;
}
export interface AnnotationState {
  marks: Annotation[];
  status: 'idle' | 'saving' | 'saved' | 'error';
  undo: boolean;
  redo: boolean;
}

export class AnnotationService {
  readonly state = new Store<AnnotationState>({
    marks: [],
    status: 'idle',
    undo: false,
    redo: false,
  });
  private undoStack: Edit[] = [];
  private redoStack: Edit[] = [];
  private queue = new SerialQueue();
  private error: unknown;
  private pending = new Set<Promise<void>>();

  constructor(
    readonly documentId: string,
    private repository: AnnotationRepository,
  ) {}
  async initialize() {
    const marks = await this.repository.list(this.documentId);
    this.state.update((value) => ({ ...value, marks }));
  }
  add(marks: Annotation[]) {
    return this.edit(() => ({ before: [], after: marks }));
  }
  remove(id: string) {
    return this.edit(() => ({
      before: this.state.get().marks.filter((mark) => mark.id === id),
      after: [],
    }));
  }
  style(id: string, changes: { color?: MarkColor; kind?: MarkKind }) {
    return this.change(id, changes);
  }
  note(id: string, note: string) {
    return this.change(id, { note }, `note:${id}`);
  }

  undo() {
    return this.run(async () => {
      const edit = this.undoStack.at(-1);
      if (!edit) return;
      await this.apply(edit.after, edit.before);
      this.undoStack.pop();
      this.redoStack.push(edit);
      this.sync();
    });
  }
  redo() {
    return this.run(async () => {
      const edit = this.redoStack.at(-1);
      if (!edit) return;
      await this.apply(edit.before, edit.after);
      this.redoStack.pop();
      this.undoStack.push(edit);
      this.sync();
    });
  }
  async flush() {
    while (this.pending.size) await Promise.allSettled(this.pending);
    if (this.error) throw this.error;
  }

  private change(id: string, changes: Partial<Annotation>, group?: string) {
    return this.edit(() => {
      const mark = this.state.get().marks.find((entry) => entry.id === id);
      if (!mark) throw new Error('批注已移除');
      return { before: [mark], after: [{ ...mark, ...changes }], group };
    });
  }
  private edit(resolve: () => Omit<Edit, 'time'>) {
    return this.run(async () => {
      const edit = { ...resolve(), time: Date.now() };
      if (JSON.stringify(edit.before) === JSON.stringify(edit.after)) return;
      await this.apply(edit.before, edit.after);
      const previous = this.undoStack.at(-1);
      if (edit.group && previous?.group === edit.group && edit.time - previous.time < 2500) {
        previous.after = edit.after;
        previous.time = edit.time;
      } else this.undoStack.push(edit);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
      this.sync();
    });
  }
  private async apply(before: Annotation[], after: Annotation[]) {
    await this.repository.commit(
      this.documentId,
      before.map((entry) => entry.id),
      after,
    );
    const changed = new Set([...before, ...after].map((entry) => entry.id));
    this.state.update((value) => ({
      ...value,
      marks: [...value.marks.filter((entry) => !changed.has(entry.id)), ...after],
    }));
  }
  private run(operation: () => Promise<void>) {
    const promise = this.queue.enqueue(async () => {
      this.state.update((value) => ({ ...value, status: 'saving' }));
      try {
        await operation();
        this.error = undefined;
        this.state.update((value) => ({ ...value, status: 'saved' }));
      } catch (error) {
        this.error = error;
        this.state.update((value) => ({ ...value, status: 'error' }));
        throw error;
      }
    });
    this.pending.add(promise);
    void promise.then(
      () => this.pending.delete(promise),
      () => this.pending.delete(promise),
    );
    return promise;
  }
  private sync() {
    this.state.update((value) => ({
      ...value,
      undo: !!this.undoStack.length,
      redo: !!this.redoStack.length,
    }));
  }
}

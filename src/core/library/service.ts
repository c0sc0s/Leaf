import type {
  DocumentMetadata,
  ImportSource,
  DocumentInteractions,
} from '@leaf/contracts/documents';
import { Store } from '@leaf/shared/events';
import { SerialQueue } from '@leaf/shared/async';
import type { LibraryRepository } from './repository.ts';
import type { DocumentsService } from '../documents/service.ts';

export interface LibraryState {
  documents: DocumentMetadata[];
  loading: boolean;
  importing: string | null;
  counts: Record<string, number>;
}
export interface ImportReport {
  added: DocumentMetadata[];
  duplicates: DocumentMetadata[];
  failures: { name: string; message: string }[];
}

export class LibraryService {
  readonly state = new Store<LibraryState>({
    documents: [],
    loading: true,
    importing: null,
    counts: {},
  });
  private imports = new SerialQueue();
  private changes = new SerialQueue();
  constructor(
    private repository: LibraryRepository,
    private documents: DocumentsService,
    private interactions: DocumentInteractions,
    private beforeRemove: (id: string) => Promise<void>,
  ) {}

  async initialize() {
    const [documents, counts] = await Promise.all([
      this.repository.list(),
      this.repository.annotationCounts(),
    ]);
    this.state.set({ documents, counts, loading: false, importing: null });
  }
  async refreshCounts() {
    const counts = await this.repository.annotationCounts();
    this.state.update((state) => ({ ...state, counts }));
  }

  import(sources: ImportSource[], signal = new AbortController().signal): Promise<ImportReport> {
    return this.imports.enqueue(async () => {
      const report: ImportReport = { added: [], duplicates: [], failures: [] };
      try {
        for (const source of sources) {
          signal.throwIfAborted();
          this.state.update((state) => ({ ...state, importing: source.name }));
          try {
            if (
              !source.files.length ||
              source.files.reduce((size, file) => size + file.data.byteLength, 0) >
                512 * 1024 * 1024
            )
              throw new Error('文档为空或超过 512 MB');
            const provider = await this.documents.importer(source, signal);
            if (!provider) continue;
            const draft = await provider.import(source, {
              signal,
              interactions: this.interactions,
            });
            if (!draft) continue;
            const staged = await this.repository.stage(draft.files, signal);
            try {
              const identity = JSON.stringify({
                formatId: draft.formatId,
                resources: [...staged.resources]
                  .sort((a, b) => a.path.localeCompare(b.path))
                  .map((entry) => [entry.path, entry.hash]),
                data: draft.data,
              });
              const digest = await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(identity),
              );
              const revision = [...new Uint8Array(digest)]
                .map((entry) => entry.toString(16).padStart(2, '0'))
                .join('');
              const duplicate = await this.repository.find(draft.formatId, revision);
              if (duplicate) {
                report.duplicates.push(duplicate);
                continue;
              }
              const metadata: DocumentMetadata = {
                id: crypto.randomUUID(),
                revision,
                formatId: draft.formatId,
                title: draft.title,
                author: draft.author,
                filename: draft.filename,
                cover: draft.cover,
                addedAt: Date.now(),
                openedAt: 0,
                favorite: false,
                progress: draft.progress ?? { fraction: 0, label: '' },
              };
              await this.repository.put(
                { metadata, source: { resources: staged.resources, data: draft.data } },
                staged,
              );
              this.state.update((state) => ({
                ...state,
                documents: [metadata, ...state.documents],
              }));
              report.added.push(metadata);
            } finally {
              await staged.dispose();
            }
          } catch (error) {
            if (signal.aborted) throw error;
            report.failures.push({
              name: source.name,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } finally {
        this.state.update((state) => ({ ...state, importing: null }));
      }
      return report;
    });
  }

  update(
    id: string,
    changes: Partial<
      Pick<DocumentMetadata, 'title' | 'author' | 'favorite' | 'progress' | 'openedAt' | 'sample'>
    >,
  ) {
    return this.changes.enqueue(async () => {
      const current = this.state.get().documents.find((entry) => entry.id === id);
      if (!current) return;
      const metadata = { ...current, ...changes };
      await this.repository.update(metadata);
      this.state.update((state) => ({
        ...state,
        documents: state.documents.map((entry) => (entry.id === id ? metadata : entry)),
      }));
    });
  }
  async remove(id: string) {
    await this.beforeRemove(id);
    await this.changes.enqueue(async () => {
      await this.repository.remove(id);
      this.state.update((state) => ({
        ...state,
        documents: state.documents.filter((entry) => entry.id !== id),
      }));
    });
    await this.refreshCounts();
  }
  progress(id: string, progress: DocumentMetadata['progress']) {
    return this.update(id, { progress, openedAt: Date.now() });
  }
}

import type { JsonObject, JsonValue } from '@leaf/shared/types';
import type { Disposable } from '@leaf/shared/lifecycle';

export interface Locator {
  documentId: string;
  revision: string;
  schema: string;
  version: number;
  payload: JsonValue;
}

export interface ResourceReference {
  path: string;
  hash: string;
  size: number;
  mime: string;
}
export interface DocumentSource {
  resources: ResourceReference[];
  data: JsonValue;
}
export interface ReadingProgress {
  fraction: number;
  label: string;
  ordinal?: number;
  total?: number;
}
export interface DocumentMetadata {
  id: string;
  revision: string;
  formatId: string;
  title: string;
  author: string;
  filename: string;
  cover: string;
  addedAt: number;
  openedAt: number;
  favorite: boolean;
  progress: ReadingProgress;
  sample?: boolean;
}
export interface DocumentRecord {
  metadata: DocumentMetadata;
  source: DocumentSource;
}
export interface ImportFile {
  name: string;
  data: Uint8Array;
  mime?: string;
}
export interface ImportSource {
  name: string;
  files: ImportFile[];
  folder?: boolean;
}
export interface DocumentDraft {
  formatId: string;
  title: string;
  author: string;
  filename: string;
  cover: string;
  files: ImportFile[];
  data: JsonValue;
  progress?: ReadingProgress;
}

export interface FormatDescriptor {
  id: string;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  folders?: boolean;
}
export interface DocumentInteractions {
  password(label: string, signal?: AbortSignal): Promise<string | null>;
  choose(
    label: string,
    options: { id: string; label: string }[],
    signal?: AbortSignal,
  ): Promise<string | null>;
}
export interface DocumentOpenServices {
  readResource(path: string, signal?: AbortSignal): Promise<Uint8Array>;
  interactions: DocumentInteractions;
  openExternal(url: string): Promise<void>;
}
export interface DocumentProvider {
  id: string;
  formats: FormatDescriptor[];
  probe(source: ImportSource, signal: AbortSignal): Promise<number>;
  import(
    source: ImportSource,
    options: { signal: AbortSignal; interactions: DocumentInteractions },
  ): Promise<DocumentDraft | null>;
  open(
    record: DocumentRecord,
    services: DocumentOpenServices,
    signal: AbortSignal,
  ): Promise<DocumentHandle>;
}

export type ContentBlock =
  | { kind: 'text'; id: string; text: string; locator: Locator }
  | { kind: 'image'; id: string; resource: ResourceReference; locator: Locator };
export interface ContentReadRequest {
  locator?: Locator;
  cursor?: JsonValue;
  maxCharacters: number;
  scope?: 'unit' | 'document';
  around?: number;
}
export interface ContentPage {
  blocks: ContentBlock[];
  nextCursor?: JsonValue;
}
export interface OutlineEntry {
  id: string;
  title: string;
  depth: number;
  locator: Locator;
}
export interface SearchHit {
  id: string;
  locator: Locator;
  excerpt: string;
  match: { start: number; end: number };
}
export interface ExportResult {
  filename: string;
  mime: string;
  data: Uint8Array;
}

export interface DocumentHandle extends Disposable {
  metadata: DocumentMetadata;
  locators: { validate(locator: Locator): boolean; label(locator: Locator): string };
  content?: { read(request: ContentReadRequest, signal: AbortSignal): Promise<ContentPage> };
  outline?: {
    read(signal: AbortSignal): Promise<OutlineEntry[]>;
    active?(locator: Locator, entries: OutlineEntry[], preferredId?: string | null): string | null;
  };
  search?: {
    search(
      query: string,
      options: { limit: number; signal: AbortSignal; onProgress?: (fraction: number) => void },
    ): Promise<SearchHit[]>;
  };
  navigation?: {
    count: number;
    label(index: number): string;
    detail?(index: number): string;
    locator(index: number): Locator;
    index(locator: Locator): number;
    thumbnail?(index: number, signal: AbortSignal): Promise<{ data: Uint8Array; mime: string }>;
  };
  export?: {
    label: string;
    run(
      annotations: import('../annotations/index.ts').Annotation[],
      signal: AbortSignal,
    ): Promise<ExportResult>;
  };
  image?: {
    read(locator: Locator, signal: AbortSignal): Promise<{ data: Uint8Array; mime: string }>;
  };
}

export function belongsToDocument(
  locator: Locator,
  metadata: Pick<DocumentMetadata, 'id' | 'revision'>,
): boolean {
  return locator.documentId === metadata.id && locator.revision === metadata.revision;
}

export function locatorPayload(locator: Locator): JsonObject {
  if (
    locator.payload === null ||
    Array.isArray(locator.payload) ||
    typeof locator.payload !== 'object'
  )
    throw new Error('Invalid locator payload');
  return locator.payload;
}

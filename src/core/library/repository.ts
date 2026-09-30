import type {
  DocumentMetadata,
  DocumentRecord,
  ImportFile,
  ResourceReference,
} from '@leaf/contracts/documents';
import type { Disposable } from '@leaf/shared/lifecycle';

export interface StagedResources extends Disposable {
  resources: ResourceReference[];
  uploads: { hash: string; token: string }[];
}
export interface DocumentLease extends Disposable {
  record: DocumentRecord;
  readResource(path: string, signal?: AbortSignal): Promise<Uint8Array>;
}
export interface LibraryRepository {
  list(): Promise<DocumentMetadata[]>;
  find(formatId: string, revision: string): Promise<DocumentMetadata | null>;
  stage(files: ImportFile[], signal: AbortSignal): Promise<StagedResources>;
  put(record: DocumentRecord, resources: StagedResources): Promise<void>;
  update(metadata: DocumentMetadata): Promise<void>;
  remove(id: string): Promise<void>;
  open(id: string): Promise<DocumentLease | null>;
  annotationCounts(): Promise<Record<string, number>>;
}

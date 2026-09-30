import type { Annotation } from '@leaf/contracts/annotations';
import type { StorageTransport } from '@leaf/contracts/transport';
import type { AnnotationRepository } from '../../core/annotations/repository.ts';
import type { PersistenceCoordinator } from '../transport/persistence.ts';

export class AnnotationClient implements AnnotationRepository {
  constructor(
    private transport: StorageTransport,
    private persistence: PersistenceCoordinator,
  ) {}
  list(documentId: string) {
    return this.transport.request('annotations.list', documentId);
  }
  commit(documentId: string, remove: string[], put: Annotation[]) {
    return this.persistence.track(
      this.transport.request('annotations.commit', { documentId, remove, put }),
      `annotations:${documentId}`,
    );
  }
}

import type { Annotation } from '@leaf/contracts/annotations';
export interface AnnotationRepository {
  list(documentId: string): Promise<Annotation[]>;
  commit(documentId: string, remove: string[], put: Annotation[]): Promise<void>;
}

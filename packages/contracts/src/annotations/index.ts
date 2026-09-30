import type { Locator } from '../documents/index.ts';

export type MarkKind = 'highlight' | 'underline';
export type MarkColor = 'amber' | 'green' | 'blue' | 'pink';
export interface Annotation {
  id: string;
  documentId: string;
  targets: Locator[];
  quote: string;
  kind: MarkKind;
  color: MarkColor;
  note: string;
  createdAt: number;
}

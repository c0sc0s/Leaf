import type { JsonObject } from '@leaf/shared/types';
import type { Disposable } from '@leaf/shared/lifecycle';
import type { DocumentHandle, Locator, ReadingProgress } from '../documents/index.ts';
import type { Annotation } from '../annotations/index.ts';

export interface TextSelection {
  quote: string;
  anchors: Locator[];
}
export interface ViewPosition {
  locator: Locator;
  settings: JsonObject;
  viewport: JsonObject;
}
export interface Bookmark {
  id: string;
  documentId: string;
  title: string;
  position: ViewPosition;
  createdAt: number;
}
export interface ScreenPoint {
  x: number;
  y: number;
}
export interface ViewSetting {
  id: string;
  label: string;
  kind: 'boolean' | 'number' | 'choice';
  group?: 'scale' | 'layout' | 'appearance';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default?: import('@leaf/shared/types').JsonValue;
}
export interface ViewCapabilities {
  selection: boolean;
  annotations: boolean;
  settings: ViewSetting[];
}
export type ViewEvent =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'position'; position: ViewPosition; progress: ReadingProgress }
  | { type: 'selection'; selection: TextSelection | null; point?: ScreenPoint }
  | { type: 'annotation'; id: string | null; point?: ScreenPoint };
export interface ReadingSnapshot {
  id: string;
  documentId: string;
  ready: boolean;
  position: ViewPosition | null;
  progress: ReadingProgress;
  selection: TextSelection | null;
  selectionPoint: ScreenPoint | null;
  activeAnnotation: { id: string; point: ScreenPoint } | null;
  canReturn: boolean;
  error: string | null;
}

export interface ReadableSession {
  id: string;
  readonly signal: AbortSignal;
  document: DocumentHandle;
  snapshot(): ReadingSnapshot;
  subscribe(listener: (snapshot: ReadingSnapshot) => void): Disposable;
  navigate(locator: Locator): Promise<void>;
  clearSelection(): void;
}

export interface ViewCommands extends Disposable {
  capabilities: ViewCapabilities;
  capturePosition(): ViewPosition;
  restorePosition(position: ViewPosition): Promise<void>;
  navigate(locator: Locator): Promise<void>;
  setSettings(settings: JsonObject): void;
  turn(direction: 1 | -1): Promise<void>;
  setAnnotations(annotations: Annotation[], activeId: string | null): void;
  setSearch(query: string, hit?: Locator): void;
  clearSelection(): void;
  setAppearance(appearance: ReadingAppearance): void;
}
export interface ReadingAppearance {
  theme: 'light' | 'dark';
  originalColors: boolean;
}

import type {
  DocumentHandle,
  Annotation,
  ViewCommands,
  ViewEvent,
  ViewPosition,
  ReadableSession,
  TextSelection,
} from '@leaf/contracts';
import type { Disposable } from '@leaf/shared/lifecycle';

export interface ViewMountContext {
  container: HTMLElement;
  document: DocumentHandle;
  position: ViewPosition | null;
  appearance: import('@leaf/contracts/reader').ReadingAppearance;
  signal: AbortSignal;
  emit(event: ViewEvent): void;
  navigate(locator: import('@leaf/contracts/documents').Locator): Promise<void>;
  notify(message: string): void;
}
export interface ViewFactory {
  id: string;
  providerId: string;
  mount(context: ViewMountContext): Promise<ViewCommands>;
}
export interface PanelContext {
  session: ReadableSession;
  selection: TextSelection | null;
  close(): void;
  openSettings(): void;
  notify(message: string): void;
}
export interface PanelFactory {
  id: string;
  label: string;
  icon?: string;
  mount(container: HTMLElement, context: PanelContext): Disposable;
}
export interface SettingsFactory {
  id: string;
  label: string;
  mount(container: HTMLElement): Disposable;
}
export interface ActionContext {
  session: ReadableSession;
  selection: TextSelection | null;
  openPanel(id: string, selection?: TextSelection | null): void;
  notify(message: string): void;
}
export interface ReaderAction {
  id: string;
  label: string;
  icon?: string;
  available?(context: ActionContext): boolean;
  run(context: ActionContext, signal: AbortSignal): void | Promise<void>;
}
export type { Annotation };

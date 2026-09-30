import type { JsonObject, JsonValue } from '@leaf/shared/types';
import type { Disposable } from '@leaf/shared/lifecycle';
import type { DocumentMetadata } from '../documents/index.ts';
import type { ReadableSession } from '../reader/index.ts';

export type Theme = 'light' | 'dark' | 'system';
export interface Settings {
  theme: Theme;
  readerTheme: 'follow' | 'light' | 'dark';
  originalColors: boolean;
  frostedGlass: boolean;
  glassTransparency: number;
}
export interface TaskEvent {
  runId: string;
  parentId?: string;
  name: string;
  phase: 'start' | 'progress' | 'complete' | 'failed' | 'cancelled';
  at: number;
  data?: JsonObject;
}
export interface ScopedStorage {
  get<T extends JsonValue = JsonValue>(key: string, documentId?: string): Promise<T | null>;
  set(key: string, value: JsonValue, documentId?: string): Promise<void>;
  delete(key: string, documentId?: string): Promise<void>;
  list(prefix: string, documentId?: string): Promise<{ key: string; value: JsonValue }[]>;
}
export interface BackendClient {
  request<T extends JsonValue>(method: string, input?: JsonValue, signal?: AbortSignal): Promise<T>;
  stream(
    method: string,
    input: JsonValue,
    options: { signal: AbortSignal; onEvent: (event: JsonValue) => void },
  ): Promise<void>;
}
export interface PluginHostAPI {
  reading: { active(): ReadableSession | null };
  library: { list(): Promise<DocumentMetadata[]> };
  storage: ScopedStorage;
  backend: BackendClient;
  tasks: { report(event: TaskEvent): Promise<void>; list(runId?: string): Promise<TaskEvent[]> };
  notify(message: string): void;
}
export interface BackendHostAPI {
  storage: ScopedStorage;
  credentials: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string | null): Promise<void>;
  };
  environment: Readonly<Record<string, string | undefined>>;
}
export interface BackendPlugin extends Disposable {
  request(method: string, input: JsonValue | undefined, signal: AbortSignal): Promise<JsonValue>;
  stream?(
    method: string,
    input: JsonValue,
    signal: AbortSignal,
    emit: (event: JsonValue) => void,
  ): Promise<void>;
}
export type BackendFactory = (host: BackendHostAPI) => BackendPlugin | Promise<BackendPlugin>;

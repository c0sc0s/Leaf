import type { JsonValue } from '@leaf/shared/types';
import type { Annotation } from '../annotations/index.ts';
import type { DocumentMetadata, DocumentRecord, ResourceReference } from '../documents/index.ts';
import type { Bookmark, ViewPosition } from '../reader/index.ts';
import type { PluginManifest, PluginDataEntry } from '../plugins/index.ts';
import type { Theme, TaskEvent } from '../host/index.ts';

export interface ContentReference {
  hash: string;
  size: number;
  mime: string;
  token?: string;
}
export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: number;
  packageHash: string;
}
export interface StorageOperations {
  'library.list': { input: undefined; output: DocumentMetadata[] };
  'library.get': { input: string; output: (DocumentRecord & { lease: string }) | null };
  'library.find': {
    input: { formatId: string; revision: string };
    output: DocumentMetadata | null;
  };
  'library.put': {
    input: DocumentRecord & { uploads: { hash: string; token: string }[] };
    output: void;
  };
  'library.update': { input: DocumentMetadata; output: void };
  'library.delete': { input: string; output: void };
  'annotations.list': { input: string; output: Annotation[] };
  'annotations.counts': { input: undefined; output: Record<string, number> };
  'annotations.commit': {
    input: { documentId: string; remove: string[]; put: Annotation[] };
    output: void;
  };
  'reader.position': { input: string; output: ViewPosition | null };
  'reader.savePosition': { input: { documentId: string; position: ViewPosition }; output: void };
  'reader.bookmarks': { input: string; output: Bookmark[] };
  'reader.putBookmark': { input: Bookmark; output: void };
  'reader.deleteBookmark': { input: string; output: void };
  'settings.list': { input: undefined; output: Record<string, JsonValue> };
  'settings.set': { input: { key: string; value: JsonValue }; output: void };
  'plugins.list': { input: undefined; output: InstalledPlugin[] };
  'plugins.bind': { input: InstalledPlugin; output: void };
  'plugins.enable': { input: { id: string; enabled: boolean }; output: void };
  'plugins.remove': { input: string; output: void };
  'plugins.data.get': {
    input: { pluginId: string; key: string; documentId?: string };
    output: JsonValue | null;
  };
  'plugins.data.set': { input: PluginDataEntry; output: void };
  'plugins.data.delete': {
    input: { pluginId: string; key: string; documentId?: string };
    output: void;
  };
  'plugins.data.list': {
    input: { pluginId: string; prefix: string; documentId?: string };
    output: { key: string; value: JsonValue }[];
  };
  'tasks.report': { input: TaskEvent & { pluginId: string }; output: void };
  'tasks.list': { input: { pluginId: string; runId?: string }; output: TaskEvent[] };
  'content.begin': { input: { size: number; mime: string }; output: string };
  'content.append': { input: { token: string; offset: number; data: string }; output: void };
  'content.finish': { input: string; output: ContentReference };
  'content.abort': { input: string; output: void };
  'content.read': {
    input: { reference: ResourceReference; token: string; offset: number };
    output: string;
  };
  'content.release': { input: string; output: void };
  flush: { input: undefined; output: void };
}
export type StorageOperation = keyof StorageOperations;
export type StorageInput<K extends StorageOperation> = StorageOperations[K]['input'];
export type StorageOutput<K extends StorageOperation> = StorageOperations[K]['output'];
export interface StorageTransport {
  request<K extends StorageOperation>(
    operation: K,
    input: StorageInput<K>,
  ): Promise<StorageOutput<K>>;
}

export interface DesktopFile {
  name: string;
  data: Uint8Array;
}
export interface DesktopFolder {
  name: string;
  files: DesktopFile[];
}
export interface WindowState {
  maximized: boolean;
  fullscreen: boolean;
}
export interface BackendRequest {
  pluginId: string;
  method: string;
  input?: JsonValue;
  requestId?: string;
}
export type BackendEvent =
  { type: 'event'; value: JsonValue } | { type: 'done' } | { type: 'error'; message: string };
export interface DesktopAPI {
  storage: StorageTransport & { onBeforeClose(callback: () => Promise<void>): () => void };
  plugins: {
    list(): Promise<import('../plugins/index.ts').PluginBinding[]>;
    prepare(data?: Uint8Array): Promise<import('../plugins/index.ts').PreparedPluginPackage | null>;
    install(data: Uint8Array): Promise<import('../plugins/index.ts').PluginBinding>;
    enable(id: string, enabled: boolean): Promise<void>;
    remove(id: string): Promise<void>;
  };
  backend: {
    request(input: BackendRequest): Promise<JsonValue>;
    cancel(id: string): void;
    stream(input: BackendRequest, listener: (event: BackendEvent) => void): () => void;
  };
  platform: string;
  translucent: boolean;
  openDocuments(extensions: string[]): Promise<DesktopFile[] | null>;
  openFolder(): Promise<DesktopFolder | null>;
  openExternal(url: string): Promise<void>;
  saveFile(name: string, data: Uint8Array): Promise<boolean>;
  ready(): void;
  setTheme(theme: Theme): void;
  setFrostedGlass(enabled: boolean): void;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  getWindowState(): Promise<WindowState>;
  onWindowState(callback: (state: WindowState) => void): () => void;
  onOpenFile(callback: (file: DesktopFile) => void): () => void;
}

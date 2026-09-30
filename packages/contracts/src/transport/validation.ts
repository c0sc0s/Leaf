import { isJsonValue, jsonObject } from '@leaf/shared/types';
import type { JsonValue } from '@leaf/shared/types';
import type { Annotation } from '../annotations/index.ts';
import type { DocumentMetadata, DocumentRecord, Locator } from '../documents/index.ts';
import type { PluginManifest } from '../plugins/index.ts';
import { compatibleVersion, HOST_API_VERSION } from '../plugins/index.ts';
import type { ViewPosition } from '../reader/index.ts';

export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0'))
    throw new Error('Invalid identifier');
  return value;
}
export function resourcePath(value: unknown): string {
  const result = identifier(value);
  if (
    result.startsWith('/') ||
    result.includes('\\') ||
    result.split('/').some((part) => !part || part === '.' || part === '..') ||
    /^[A-Za-z]:/.test(result)
  )
    throw new Error('Invalid resource path');
  return result;
}
export function json(value: unknown): JsonValue {
  if (!isJsonValue(value)) throw new Error('Invalid JSON value');
  return value;
}
export function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid number');
  return value;
}
export function locator(value: unknown, documentId?: string, revision?: string): Locator {
  const item = jsonObject(value);
  identifier(item.documentId);
  identifier(item.revision);
  identifier(item.schema);
  if (
    !Number.isSafeInteger(item.version) ||
    Number(item.version) < 1 ||
    (documentId && item.documentId !== documentId) ||
    (revision && item.revision !== revision)
  )
    throw new Error('Invalid locator identity');
  json(item.payload);
  return item as unknown as Locator;
}
export function position(value: unknown, documentId: string, revision: string): ViewPosition {
  const item = jsonObject(value);
  locator(item.locator, documentId, revision);
  jsonObject(item.settings);
  jsonObject(item.viewport);
  return item as unknown as ViewPosition;
}
export function metadata(value: unknown): DocumentMetadata {
  const item = jsonObject(value);
  for (const key of ['id', 'revision', 'formatId']) identifier(item[key]);
  for (const key of ['title', 'author', 'filename', 'cover'])
    if (typeof item[key] !== 'string') throw new Error(`Invalid metadata ${key}`);
  finite(item.addedAt);
  finite(item.openedAt);
  if (
    typeof item.favorite !== 'boolean' ||
    (item.sample !== undefined && typeof item.sample !== 'boolean')
  )
    throw new Error('Invalid metadata flags');
  const progress = jsonObject(item.progress);
  if (
    finite(progress.fraction) < 0 ||
    finite(progress.fraction) > 1 ||
    typeof progress.label !== 'string'
  )
    throw new Error('Invalid progress');
  return item as unknown as DocumentMetadata;
}
export function documentRecord(value: unknown): DocumentRecord {
  const item = jsonObject(value);
  metadata(item.metadata);
  const source = jsonObject(item.source);
  if (!Array.isArray(source.resources) || !source.resources.length)
    throw new Error('Missing document resources');
  const paths = new Set<string>();
  for (const raw of source.resources) {
    const entry = jsonObject(raw);
    const name = resourcePath(entry.path);
    if (
      paths.has(name) ||
      typeof entry.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.hash) ||
      !Number.isSafeInteger(entry.size) ||
      Number(entry.size) < 0 ||
      typeof entry.mime !== 'string'
    )
      throw new Error('Invalid resource reference');
    paths.add(name);
  }
  json(source.data);
  return item as unknown as DocumentRecord;
}
export function annotation(value: unknown, documentId: string, revision: string): Annotation {
  const item = jsonObject(value);
  identifier(item.id);
  if (
    item.documentId !== documentId ||
    !Array.isArray(item.targets) ||
    !item.targets.length ||
    !['highlight', 'underline'].includes(String(item.kind)) ||
    !['amber', 'green', 'blue', 'pink'].includes(String(item.color))
  )
    throw new Error('Invalid annotation');
  for (const target of item.targets) locator(target, documentId, revision);
  if (typeof item.quote !== 'string' || typeof item.note !== 'string')
    throw new Error('Invalid annotation text');
  finite(item.createdAt);
  return item as unknown as Annotation;
}
export function manifest(value: unknown): PluginManifest {
  const item = jsonObject(value);
  if (typeof item.id !== 'string' || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(item.id))
    throw new Error('Invalid plugin ID');
  identifier(item.name);
  identifier(item.description);
  if (
    typeof item.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(item.version) ||
    typeof item.hostApi !== 'string' ||
    !compatibleVersion(HOST_API_VERSION, item.hostApi)
  )
    throw new Error('Unsupported plugin API');
  const entries = jsonObject(item.entries);
  resourcePath(entries.renderer);
  if (entries.backend !== undefined) resourcePath(entries.backend);
  if (item.styles !== undefined) {
    if (!Array.isArray(item.styles)) throw new Error('Invalid plugin styles');
    for (const style of item.styles) resourcePath(style);
  }
  const contributions = jsonObject(item.contributes);
  for (const [kind, ids] of Object.entries(contributions)) {
    if (
      ![
        'documentProviders',
        'views',
        'selectionActions',
        'toolbarActions',
        'panels',
        'settings',
      ].includes(kind) ||
      !Array.isArray(ids) ||
      ids.some((id) => typeof id !== 'string' || !id) ||
      new Set(ids).size !== ids.length
    )
      throw new Error('Invalid contributions');
  }
  if (
    !Array.isArray(item.permissions) ||
    item.permissions.some(
      (permission) =>
        !['documents', 'storage', 'backend', 'credentials', 'network'].includes(String(permission)),
    )
  )
    throw new Error('Invalid plugin permissions');
  const dependencies = jsonObject(item.dependencies);
  for (const [id, range] of Object.entries(dependencies))
    if (
      id === item.id ||
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(id) ||
      typeof range !== 'string' ||
      !/^[\^~]?\d+\.\d+\.\d+$/.test(range)
    )
      throw new Error('Invalid plugin dependency');
  return item as unknown as PluginManifest;
}

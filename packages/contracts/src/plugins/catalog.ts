import type { PluginManifest } from './index.ts';
import { identifier } from '../transport/validation.ts';
import { jsonObject } from '@leaf/shared/types';

export interface CatalogEntry {
  manifest: PluginManifest;
  author: string;
  details: string;
  platforms: ('darwin' | 'win32' | 'linux')[];
  download: { url: string; size: number; sha256: string };
}
export interface PluginCatalog {
  schemaVersion: 1;
  updatedAt: string;
  expiresAt: string;
  plugins: CatalogEntry[];
}
export interface SignedCatalog {
  payload: string;
  signature: string;
}
export interface CatalogSnapshot {
  catalog: PluginCatalog;
  fetchedAt: number;
  offline: boolean;
  platform: string;
}
export interface DownloadProgress {
  received: number;
  total: number;
}
export type CatalogDownloadEvent =
  | ({ type: 'progress' } & DownloadProgress)
  | { type: 'done'; data: string }
  | { type: 'error'; message: string };
export const CATALOG_LIMIT = 1024 * 1024;
export const PACKAGE_LIMIT = 64 * 1024 * 1024;

export function catalogEntry(value: unknown): CatalogEntry {
  const entry = jsonObject(value),
    descriptor = jsonObject(entry.manifest);
  if (
    typeof descriptor.id !== 'string' ||
    !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(descriptor.id)
  )
    throw new Error('插件目录包含无效 ID');
  for (const key of ['name', 'description']) identifier(descriptor[key]);
  if (
    typeof descriptor.version !== 'string' ||
    !/^\d+\.\d+\.\d+$/.test(descriptor.version) ||
    typeof descriptor.hostApi !== 'string' ||
    !/^[\^~]?\d+\.\d+\.\d+$/.test(descriptor.hostApi)
  )
    throw new Error('插件目录包含无效版本');
  // Discovery also describes plugins for newer host APIs; archives receive full validation before installation.
  jsonObject(descriptor.entries);
  jsonObject(descriptor.contributes);
  if (
    !Array.isArray(descriptor.permissions) ||
    descriptor.permissions.length > 32 ||
    descriptor.permissions.some((permission) => typeof permission !== 'string' || !permission) ||
    new Set(descriptor.permissions).size !== descriptor.permissions.length
  )
    throw new Error('插件目录包含无效权限');
  const dependencies = jsonObject(descriptor.dependencies);
  for (const [id, range] of Object.entries(dependencies))
    if (
      !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(id) ||
      typeof range !== 'string' ||
      !/^[\^~]?\d+\.\d+\.\d+$/.test(range)
    )
      throw new Error('插件目录包含无效依赖');
  identifier(entry.author);
  if (
    typeof entry.details !== 'string' ||
    entry.details.length > 10000 ||
    !Array.isArray(entry.platforms) ||
    !entry.platforms.length ||
    entry.platforms.some((platform) => !['darwin', 'win32', 'linux'].includes(String(platform)))
  )
    throw new Error('插件目录信息无效');
  const download = jsonObject(entry.download);
  if (
    typeof download.url !== 'string' ||
    !Number.isSafeInteger(download.size) ||
    Number(download.size) <= 0 ||
    Number(download.size) > PACKAGE_LIMIT ||
    typeof download.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(download.sha256)
  )
    throw new Error('插件下载信息无效');
  const url = new URL(download.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('插件包必须使用 HTTPS 下载');
  return entry as unknown as CatalogEntry;
}
export function parseCatalog(value: unknown): PluginCatalog {
  const item = jsonObject(value);
  if (
    item.schemaVersion !== 1 ||
    typeof item.updatedAt !== 'string' ||
    typeof item.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(item.updatedAt)) ||
    !Number.isFinite(Date.parse(item.expiresAt)) ||
    Date.parse(item.updatedAt) >= Date.parse(item.expiresAt) ||
    !Array.isArray(item.plugins) ||
    item.plugins.length > 500
  )
    throw new Error('插件目录格式无效');
  const ids = new Set<string>();
  for (const raw of item.plugins) {
    const entry = catalogEntry(raw);
    if (ids.has(entry.manifest.id)) throw new Error('插件目录包含重复 ID');
    ids.add(entry.manifest.id);
  }
  return item as unknown as PluginCatalog;
}
export function compareVersions(a: string, b: string) {
  const left = a.split('.').map(Number),
    right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  return 0;
}

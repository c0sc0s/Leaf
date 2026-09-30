import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { manifest, resourcePath } from '@leaf/contracts/validation';
import type { PackageEnvelope, PluginManifest } from '@leaf/contracts/plugins';

const archiveLimit = 64 * 1024 * 1024,
  expandedLimit = 256 * 1024 * 1024;
export function hashBytes(data: Uint8Array) {
  return createHash('sha256').update(data).digest('hex');
}
export interface VerifiedPackage {
  manifest: PluginManifest;
  files: Map<string, Buffer>;
  hash: string;
}

export function readPackage(data: Uint8Array): VerifiedPackage {
  if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > archiveLimit)
    throw new Error('插件包为空或超过 64 MB');
  let envelope: PackageEnvelope;
  try {
    envelope = JSON.parse(gunzipSync(data, { maxOutputLength: expandedLimit }).toString('utf8'));
  } catch {
    throw new Error('插件包格式无效');
  }
  const descriptor = manifest(envelope.manifest);
  if (!envelope.files || typeof envelope.files !== 'object' || Array.isArray(envelope.files))
    throw new Error('插件包没有文件');
  const entries = Object.entries(envelope.files);
  if (!entries.length || entries.length > 10000) throw new Error('插件包文件数量无效');
  const files = new Map<string, Buffer>();
  let bytes = 0;
  for (const [name, entry] of entries) {
    resourcePath(name);
    if (
      !entry ||
      typeof entry.data !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(entry.data) ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      throw new Error('插件文件格式无效');
    const data = Buffer.from(entry.data, 'base64');
    bytes += data.byteLength;
    if (bytes > expandedLimit || hashBytes(data) !== entry.sha256)
      throw new Error('插件文件校验失败');
    files.set(name, data);
  }
  if (
    !files.has(descriptor.entries.renderer) ||
    (descriptor.entries.backend && !files.has(descriptor.entries.backend))
  )
    throw new Error('插件入口文件缺失');
  for (const style of descriptor.styles ?? [])
    if (!files.has(style)) throw new Error('插件样式文件缺失');
  for (const entry of Object.values(descriptor.entries))
    if (!entry.endsWith('.js') && !entry.endsWith('.mjs'))
      throw new Error('插件入口必须是 JavaScript 模块');
  return { manifest: descriptor, files, hash: hashBytes(data) };
}

export function writePackage(
  descriptor: PluginManifest,
  files: Map<string, Uint8Array>,
): Uint8Array {
  manifest(descriptor);
  const envelope: PackageEnvelope = {
    manifest: descriptor,
    files: Object.fromEntries(
      [...files]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, data]) => [
          resourcePath(name),
          { data: Buffer.from(data).toString('base64'), sha256: hashBytes(data) },
        ]),
    ),
  };
  const archive = gzipSync(JSON.stringify(envelope), { level: 9 });
  readPackage(archive);
  return archive;
}

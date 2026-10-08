import { verify } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseCatalog, CATALOG_LIMIT, PACKAGE_LIMIT } from '@leaf/contracts/catalog';
import type {
  PluginCatalog,
  SignedCatalog,
  CatalogSnapshot,
  DownloadProgress,
} from '@leaf/contracts/catalog';
import { compatibleVersion, HOST_API_VERSION } from '@leaf/contracts/plugins';
import { readPackage, hashBytes } from './package.ts';
import { renameWithRetry } from '../platform/filesystem.ts';

export interface CatalogSource {
  url: string;
  publicKey: string;
}
export function verifyCatalog(bytes: Uint8Array, key: string, now = Date.now()): PluginCatalog {
  if (bytes.byteLength > CATALOG_LIMIT) throw new Error('插件目录超过大小限制');
  const envelope = JSON.parse(Buffer.from(bytes).toString('utf8')) as SignedCatalog;
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string')
    throw new Error('插件目录签名缺失');
  const payload = Buffer.from(envelope.payload, 'base64'),
    signature = Buffer.from(envelope.signature, 'base64');
  if (signature.length !== 64 || !verify(null, payload, key, signature))
    throw new Error('插件目录签名校验失败');
  const catalog = parseCatalog(JSON.parse(payload.toString('utf8')));
  if (Date.parse(catalog.expiresAt) <= now || Date.parse(catalog.updatedAt) > now + 300000)
    throw new Error('插件目录已过期或时间无效，请刷新目录');
  return catalog;
}
export class CatalogService {
  private snapshot?: CatalogSnapshot;
  private loading?: Promise<CatalogSnapshot>;
  private cacheFile: string;
  private source: CatalogSource;
  private fetcher: (url: string, init?: RequestInit) => Promise<Response>;
  private platform: string;
  constructor(
    cacheFile: string,
    source: CatalogSource,
    fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
    platform: string = process.platform,
  ) {
    this.cacheFile = cacheFile;
    this.source = source;
    this.fetcher = fetcher;
    this.platform = platform;
  }
  list(refresh = false): Promise<CatalogSnapshot> {
    if (
      !refresh &&
      this.snapshot &&
      !this.snapshot.offline &&
      Date.now() - this.snapshot.fetchedAt < 1800000 &&
      Date.parse(this.snapshot.catalog.expiresAt) > Date.now()
    )
      return Promise.resolve(this.snapshot);
    if (this.loading) return this.loading;
    this.loading = this.load().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }
  private async load(): Promise<CatalogSnapshot> {
    let cached: { envelope: Uint8Array; fetchedAt: number; catalog: PluginCatalog } | undefined;
    try {
      const value = JSON.parse(await readFile(this.cacheFile, 'utf8'));
      const envelope = Buffer.from(value.envelope, 'base64');
      const catalog = verifyCatalog(envelope, this.source.publicKey);
      if (typeof value.fetchedAt === 'number' && Number.isFinite(value.fetchedAt))
        cached = { envelope, fetchedAt: value.fetchedAt, catalog };
    } catch {
      /* An unverifiable cache cannot establish trust. */
    }
    try {
      const envelope = await this.read(this.source.url, CATALOG_LIMIT, AbortSignal.timeout(15000));
      const catalog = verifyCatalog(envelope, this.source.publicKey);
      if (cached && Date.parse(catalog.updatedAt) < Date.parse(cached.catalog.updatedAt))
        throw new Error('拒绝过期的插件目录版本');
      const fetchedAt = Date.now();
      await mkdir(path.dirname(this.cacheFile), { recursive: true });
      const temporary = this.cacheFile + '.tmp';
      await writeFile(
        temporary,
        JSON.stringify({ envelope: Buffer.from(envelope).toString('base64'), fetchedAt }),
        { mode: 0o600 },
      );
      await renameWithRetry(temporary, this.cacheFile);
      this.snapshot = { catalog, fetchedAt, offline: false, platform: this.platform };
    } catch (error) {
      if (!cached)
        throw new Error(
          `无法加载插件目录：${error instanceof Error ? error.message : String(error)}`,
        );
      this.snapshot = {
        catalog: cached.catalog,
        fetchedAt: cached.fetchedAt,
        offline: true,
        platform: this.platform,
      };
    }
    return this.snapshot;
  }
  async download(
    id: string,
    sha256: string,
    signal: AbortSignal,
    progress: (value: DownloadProgress) => void,
  ): Promise<Uint8Array> {
    const snapshot =
      this.snapshot && Date.parse(this.snapshot.catalog.expiresAt) > Date.now()
        ? this.snapshot
        : await this.list();
    const entry = snapshot.catalog.plugins.find((entry) => entry.manifest.id === id);
    if (!entry) throw new Error('目录中没有此插件，请刷新后重试');
    if (entry.download.sha256 !== sha256) throw new Error('目录已更新，请刷新并重新确认安装');
    if (
      !compatibleVersion(HOST_API_VERSION, entry.manifest.hostApi) ||
      !entry.platforms.some((platform) => platform === this.platform)
    )
      throw new Error('此插件与当前应用或系统不兼容');
    const data = await this.read(
      entry.download.url,
      PACKAGE_LIMIT,
      AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      entry.download.size,
      progress,
    );
    if (hashBytes(data) !== entry.download.sha256) throw new Error('插件包下载校验失败');
    const verified = readPackage(data);
    if (!isDeepStrictEqual(verified.manifest, entry.manifest))
      throw new Error('插件包声明与目录不一致');
    return data;
  }
  private async read(
    url: string,
    limit: number,
    signal: AbortSignal,
    size?: number,
    progress?: (value: DownloadProgress) => void,
  ) {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
        throw new Error('下载地址必须使用 HTTPS');
      const response = await this.fetcher(url, {
        signal,
        redirect: 'manual',
        credentials: 'omit',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('下载重定向无效');
        url = new URL(location, url).href;
        continue;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(`下载服务返回 ${response.status}`);
      }
      const length = Number(response.headers.get('content-length'));
      if (length > limit || (size !== undefined && length > 0 && length !== size)) {
        await response.body.cancel();
        throw new Error('下载大小与目录不一致或超过限制');
      }
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let received = 0;
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > limit || (size !== undefined && received > size))
            throw new Error('下载超过大小限制');
          chunks.push(value);
          progress?.({ received, total: size ?? length });
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally {
        reader.releaseLock();
      }
      if (!received || (size !== undefined && received !== size)) throw new Error('插件下载不完整');
      return new Uint8Array(Buffer.concat(chunks, received));
    }
    throw new Error('下载重定向次数过多');
  }
}

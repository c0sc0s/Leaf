import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CatalogService, verifyCatalog } from '../../../../electron/plugins/catalog';
import { plainManifest, plainPackage } from '../../../fixtures/plugin';
import { hashBytes } from '../../../../electron/plugins/package';
import type { PluginCatalog } from '@leaf/contracts/catalog';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-catalog-'));
  roots.push(root);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const source = {
    url: 'https://example.com/catalog.json',
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
  const archive = plainPackage();
  const catalog: PluginCatalog = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    plugins: [
      {
        manifest: plainManifest,
        author: 'Leaf',
        details: 'Reader',
        platforms: ['darwin', 'win32', 'linux'],
        download: {
          url: 'https://example.com/plain.leaf-plugin',
          size: archive.byteLength,
          sha256: hashBytes(archive),
        },
      },
    ],
  };
  const envelope = () => {
    const payload = Buffer.from(JSON.stringify(catalog));
    return Buffer.from(
      JSON.stringify({
        payload: payload.toString('base64'),
        signature: sign(null, payload, privateKey).toString('base64'),
      }),
    );
  };
  const fetcher = vi.fn(
    async (url: string, _init?: RequestInit) =>
      new Response(new Uint8Array(url === source.url ? envelope() : archive)),
  );
  const file = path.join(root, 'cache.json');
  const service = new CatalogService(file, source, fetcher, 'darwin');
  return { root, source, archive, catalog, envelope, fetcher, service, file };
}
describe('signed plugin catalog and downloads', () => {
  it('verifies signatures, rejects payload tampering, expiry, duplicate IDs and unsafe package URLs', async () => {
    const { catalog, envelope, source } = await setup();
    expect(verifyCatalog(envelope(), source.publicKey).plugins).toHaveLength(1);
    const changed = JSON.parse(envelope().toString());
    changed.payload = Buffer.from('{}').toString('base64');
    expect(() => verifyCatalog(Buffer.from(JSON.stringify(changed)), source.publicKey)).toThrow(
      '签名',
    );
    catalog.expiresAt = new Date(Date.now() - 1).toISOString();
    expect(() => verifyCatalog(envelope(), source.publicKey)).toThrow();
    catalog.expiresAt = new Date(Date.now() + 60000).toISOString();
    catalog.plugins.push(catalog.plugins[0]);
    expect(() => verifyCatalog(envelope(), source.publicKey)).toThrow('重复');
    catalog.plugins.pop();
    catalog.plugins[0].download.url = 'http://example.com/plugin';
    expect(() => verifyCatalog(envelope(), source.publicKey)).toThrow('HTTPS');
  });
  it('uses only verified caches while offline and rejects rollback catalogs', async () => {
    const { service, fetcher, file, source, catalog } = await setup();
    const fresh = await service.list();
    expect(fresh.offline).toBe(false);
    fetcher.mockRejectedValueOnce(new Error('offline'));
    expect((await service.list(true)).offline).toBe(true);
    catalog.updatedAt = new Date(Date.parse(catalog.updatedAt) - 1000).toISOString();
    expect((await service.list(true)).catalog.updatedAt).toBe(fresh.catalog.updatedAt);
    await writeFile(
      file,
      JSON.stringify({ envelope: Buffer.from('{}').toString('base64'), fetchedAt: Date.now() }),
    );
    fetcher.mockRejectedValue(new Error('offline'));
    await expect(new CatalogService(file, source, fetcher).list()).rejects.toThrow('无法加载');
  });
  it('validates package hash and manifest against the approved directory and reports bytes', async () => {
    const { service, catalog, archive, fetcher } = await setup();
    const progress = vi.fn(),
      expected = catalog.plugins[0].download.sha256;
    expect(
      await service.download('test.plain', expected, new AbortController().signal, progress),
    ).toEqual(new Uint8Array(archive));
    expect(progress).toHaveBeenLastCalledWith({
      received: archive.byteLength,
      total: archive.byteLength,
    });
    await expect(
      service.download('test.plain', 'b'.repeat(64), new AbortController().signal, progress),
    ).rejects.toThrow('重新确认');
    fetcher.mockResolvedValueOnce(new Response(new Uint8Array(archive.byteLength)));
    await expect(
      service.download('test.plain', expected, new AbortController().signal, progress),
    ).rejects.toThrow('校验');
    catalog.plugins[0].manifest = { ...plainManifest, permissions: [] };
    await service.list(true);
    await expect(
      service.download('test.plain', expected, new AbortController().signal, progress),
    ).rejects.toThrow('声明');
  });
  it('rejects truncated or oversized responses and HTTPS downgrades', async () => {
    const { service, catalog, fetcher } = await setup();
    await service.list();
    const hash = catalog.plugins[0].download.sha256,
      signal = new AbortController().signal;
    for (const response of [
      new Response(new Uint8Array(1)),
      new Response(new Uint8Array(catalog.plugins[0].download.size + 1)),
      new Response(null, { status: 302, headers: { location: 'http://example.com/plain' } }),
    ]) {
      fetcher.mockResolvedValueOnce(response);
      await expect(service.download('test.plain', hash, signal, () => {})).rejects.toThrow();
    }
  });
  it('cancels an in-flight download without producing installable data', async () => {
    const { service, catalog, fetcher } = await setup();
    await service.list();
    const controller = new AbortController();
    fetcher.mockImplementationOnce(
      (_url, options) =>
        new Promise((_resolve, reject) =>
          options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), {
            once: true,
          }),
        ),
    );
    const pending = service.download(
      'test.plain',
      catalog.plugins[0].download.sha256,
      controller.signal,
      () => {},
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});

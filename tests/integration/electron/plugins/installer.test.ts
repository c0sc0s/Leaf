import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, symlink, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { PluginManifest } from '@leaf/contracts/plugins';
import {
  openStorage,
  type StorageRepository,
} from '../../../../electron/storage/repositories/index.ts';
import { PluginInstaller } from '../../../../electron/plugins/installer.ts';
import { readPackage, writePackage } from '../../../../electron/plugins/package.ts';
import { gzipSync, gunzipSync } from 'node:zlib';

const roots: string[] = [],
  stores: StorageRepository[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) store.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
export function descriptor(id: string, reader = true): PluginManifest {
  return {
    id,
    name: id,
    description: 'Test plugin',
    version: '1.0.0',
    hostApi: '^1.0.0',
    entries: { renderer: 'renderer.js' },
    contributes: reader ? { documentProviders: [id + '.document'], views: [id + '.view'] } : {},
    permissions: [],
    dependencies: {},
  };
}
export function archive(manifest: PluginManifest) {
  return writePackage(
    manifest,
    new Map([['renderer.js', new TextEncoder().encode('export default { activate() {} };')]]),
  );
}
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-plugins-'));
  roots.push(root);
  const storage = openStorage(path.join(root, 'storage'));
  stores.push(storage);
  const installer = new PluginInstaller(
    path.join(root, 'plugins'),
    { request: async (operation, input) => storage.request(operation, input) },
    (entry, resource) => `/${entry.manifest.id}/${entry.packageHash}/${resource}`,
  );
  return { root, storage, installer };
}
describe('plugin packages', () => {
  it('verifies file hashes and rejects traversal, missing entries and incompatible APIs', () => {
    const bytes = archive(descriptor('test.reader')),
      envelope = JSON.parse(gunzipSync(bytes).toString());
    expect(readPackage(bytes).manifest.id).toBe('test.reader');
    for (const alter of [
      (value: typeof envelope) => {
        value.files['renderer.js'].data = Buffer.from('changed').toString('base64');
      },
      (value: typeof envelope) => {
        value.files['../escape'] = value.files['renderer.js'];
      },
      (value: typeof envelope) => {
        value.manifest.entries.renderer = 'missing.js';
      },
      (value: typeof envelope) => {
        value.manifest.hostApi = '^2.0.0';
      },
    ]) {
      const invalid = structuredClone(envelope);
      alter(invalid);
      expect(() => readPackage(gzipSync(JSON.stringify(invalid)))).toThrow();
    }
  });
  it('installs resources, preserves private data across uninstall, and retains a reading plugin', async () => {
    const { installer, storage } = await setup(),
      first = await installer.install(archive(descriptor('test.pdf')));
    expect(
      await readFile(
        await installer.resource('test.pdf', first.packageHash, 'renderer.js'),
        'utf8',
      ),
    ).toContain('activate');
    await expect(installer.remove('test.pdf')).rejects.toThrow('至少');
    await expect(installer.enable('test.pdf', false)).rejects.toThrow('至少');
    await installer.install(archive(descriptor('test.markdown')));
    storage.request('plugins.data.set', {
      pluginId: 'test.pdf',
      key: 'saved',
      value: { note: 'retained' },
    });
    await installer.remove('test.pdf');
    expect(storage.request('plugins.data.get', { pluginId: 'test.pdf', key: 'saved' })).toEqual({
      note: 'retained',
    });
    await expect(
      installer.resource('test.pdf', first.packageHash, 'renderer.js'),
    ).rejects.toThrow();
    const replaced = descriptor('test.markdown', false);
    await expect(installer.install(archive(replaced))).rejects.toThrow('至少');
  });
  it('checks dependencies and blocks resources outside the installed package', async () => {
    const { installer, root } = await setup(),
      dependency = descriptor('test.base');
    const addon = { ...descriptor('test.addon', false), dependencies: { 'test.base': '^1.0.0' } };
    await expect(installer.install(archive(addon))).rejects.toThrow('test.base');
    const installed = await installer.install(archive(dependency));
    await installer.install(archive(addon));
    await expect(installer.enable('test.base', false)).rejects.toThrow('test.base');
    const directory = path.join(root, 'plugins', 'test.base', installed.packageHash);
    await mkdir(path.join(root, 'outside'));
    await symlink(path.join(root, 'outside'), path.join(directory, 'escape'));
    await expect(
      installer.resource('test.base', installed.packageHash, '../renderer.js'),
    ).rejects.toThrow();
    await expect(
      installer.resource('test.base', installed.packageHash, 'escape/file'),
    ).rejects.toThrow();
  });
  it('repairs a damaged installed package by verifying its files during reinstall', async () => {
    const { installer } = await setup(),
      bytes = archive(descriptor('test.reader'));
    const entry = await installer.install(bytes),
      file = await installer.resource(entry.manifest.id, entry.packageHash, 'renderer.js');
    await writeFile(file, 'damaged');
    await writeFile(path.join(path.dirname(file), 'unexpected.js'), 'extra');
    await installer.install(bytes);
    expect(await readFile(file, 'utf8')).toContain('activate');
    await expect(readFile(path.join(path.dirname(file), 'unexpected.js'))).rejects.toThrow();
  });
});

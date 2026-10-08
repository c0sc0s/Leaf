import { describe, expect, it, vi } from 'vitest';
import { PluginCatalog } from '../../../../src/core/plugins/catalog';
import { PluginManager } from '../../../../src/core/plugins/manager';
import { PluginRegistry } from '../../../../src/core/plugins/registry';
import type { CatalogEntry, CatalogSnapshot } from '@leaf/contracts/catalog';
import type { PluginBinding } from '@leaf/contracts/plugins';
const entry = (
  id: string,
  dependencies: Record<string, string> = {},
  version = '1.0.0',
): CatalogEntry => ({
  manifest: {
    id,
    name: id,
    description: id,
    version,
    hostApi: '^1.0.0',
    entries: { renderer: 'renderer.js' },
    contributes: {},
    permissions: ['storage'],
    dependencies,
  },
  author: 'Leaf',
  details: 'Details',
  platforms: ['darwin', 'win32', 'linux'],
  download: {
    url: `https://example.com/${id}.leaf-plugin`,
    size: id.length,
    sha256: 'a'.repeat(64),
  },
});
const binding = (entry: CatalogEntry, enabled = true): PluginBinding => ({
  manifest: entry.manifest,
  packageHash: entry.download.sha256,
  moduleURL: 'test',
  installedAt: 0,
  enabled,
});
async function setup(entries: CatalogEntry[], initial: PluginBinding[] = []) {
  const installed = [...initial],
    order: string[] = [];
  const platform = {
    list: async () => installed,
    prepare: async (data?: Uint8Array) => ({
      data: data!,
      manifest: entries.find((entry) => entry.manifest.id === new TextDecoder().decode(data))!
        .manifest,
    }),
    install: vi.fn(async (data: Uint8Array) => {
      const item = entries.find((entry) => entry.manifest.id === new TextDecoder().decode(data))!;
      const result = binding(
        item,
        installed.find((plugin) => plugin.manifest.id === item.manifest.id)?.enabled ?? true,
      );
      order.push('install:' + item.manifest.id);
      installed.splice(
        0,
        installed.length,
        ...installed.filter((plugin) => plugin.manifest.id !== item.manifest.id),
        result,
      );
      return result;
    }),
    enable: vi.fn(async (id: string, enabled: boolean) => {
      order.push('enable:' + id);
      installed.find((plugin) => plugin.manifest.id === id)!.enabled = enabled;
    }),
    remove: async () => {},
  };
  const loader = {
    reload: vi.fn(async () => {
      order.push('reload');
    }),
    activate: async () => ({ dispose() {} }),
  };
  const manager = new PluginManager(platform, loader, new PluginRegistry(), async () => {});
  await manager.initialize();
  const snapshot: CatalogSnapshot = {
    catalog: {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      plugins: entries,
    },
    platform: 'darwin',
    fetchedAt: Date.now(),
    offline: false,
  };
  const source = {
    list: async () => snapshot,
    download: vi.fn(async (entry: CatalogEntry, _signal: AbortSignal) =>
      new TextEncoder().encode(entry.manifest.id),
    ),
  };
  const catalog = new PluginCatalog(source, manager);
  await catalog.load();
  return { catalog, manager, source, platform, loader, snapshot, order };
}
describe('online plugin installation', () => {
  it('downloads every dependency before changing state and installs in dependency order', async () => {
    const dependency = entry('test.dep'),
      main = entry('test.main', { 'test.dep': '^1.0.0' });
    const { catalog, manager, source, order } = await setup([main, dependency]);
    await catalog.install('test.main', catalog.plan('test.main'));
    expect(source.download.mock.calls.map((call) => call[0].manifest.id)).toEqual([
      'test.dep',
      'test.main',
    ]);
    expect(order).toEqual(['install:test.dep', 'install:test.main']);
    expect(manager.state.get().map((plugin) => plugin.status)).toEqual(['active', 'active']);
  });
  it('interleaves enabling an installed dependency after installing its missing dependency', async () => {
    const leaf = entry('test.leaf'),
      middle = entry('test.middle', { 'test.leaf': '^1.0.0' }),
      main = entry('test.main', { 'test.middle': '^1.0.0' });
    const { catalog, order } = await setup([leaf, middle, main], [binding(middle, false)]);
    await catalog.install('test.main', catalog.plan('test.main'));
    expect(order).toEqual(['install:test.leaf', 'enable:test.middle', 'install:test.main']);
  });
  it('rejects dependency cycles, conflicting versions, missing dependencies and incompatible platforms', async () => {
    const cases = [
      [entry('test.a', { 'test.b': '^1.0.0' }), entry('test.b', { 'test.a': '^1.0.0' })],
      [
        entry('test.a', { 'test.b': '^1.0.0', 'test.c': '^1.0.0' }),
        entry('test.b', { 'test.shared': '^1.0.0' }),
        entry('test.c', { 'test.shared': '^2.0.0' }),
        entry('test.shared'),
      ],
      [entry('test.a', { 'test.missing': '^1.0.0' })],
    ];
    for (const entries of cases) {
      const { catalog } = await setup(entries);
      expect(() => catalog.plan('test.a')).toThrow();
    }
    const item = entry('test.a');
    item.platforms = ['win32'];
    const { catalog } = await setup([item]);
    expect(() => catalog.plan('test.a')).toThrow('系统');
  });
  it('preserves installed plugins when a download fails or is cancelled', async () => {
    const { catalog, source, platform } = await setup([entry('test.a')]);
    source.download.mockRejectedValueOnce(new Error('connection lost'));
    await expect(catalog.install('test.a', catalog.plan('test.a'))).rejects.toThrow(
      'connection lost',
    );
    expect(platform.install).not.toHaveBeenCalled();
    source.download.mockImplementationOnce(
      (_entry, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    );
    const pending = catalog.install('test.a', catalog.plan('test.a'));
    catalog.cancel();
    await pending;
    expect(platform.install).not.toHaveBeenCalled();
    expect(catalog.state.get().progress).toBeUndefined();
  });
  it('rejects an update that would break an enabled dependent before downloading', async () => {
    const previous = entry('test.dep'),
      updated = entry('test.dep', {}, '2.0.0'),
      dependent = entry('test.main', { 'test.dep': '^1.0.0' });
    const { catalog, source, platform } = await setup(
      [updated],
      [binding(previous), binding(dependent)],
    );
    await expect(
      catalog.install('test.dep', { entries: [updated], enable: [], order: ['test.dep'] }),
    ).rejects.toThrow('请先停用 test.main');
    expect(source.download).not.toHaveBeenCalled();
    expect(platform.install).not.toHaveBeenCalled();
    const disabled = await setup([updated], [binding(previous), binding(dependent, false)]);
    expect(disabled.catalog.plan('test.dep').entries).toEqual([updated]);
  });
  it('limits changes when enabling installed dependencies without downloading them', async () => {
    const dependencies = Array.from({ length: 20 }, (_, index) =>
      entry(`test.dep${index}`, index ? { [`test.dep${index - 1}`]: '^1.0.0' } : {}),
    );
    const main = entry('test.main', { 'test.dep19': '^1.0.0' });
    const { catalog, source, platform } = await setup(
      [main],
      dependencies.map((dependency) => binding(dependency, false)),
    );
    expect(() => catalog.plan('test.main')).toThrow('超过限制');
    expect(source.download).not.toHaveBeenCalled();
    expect(platform.enable).not.toHaveBeenCalled();
    const allowed = await setup(
      [main],
      dependencies.map((dependency, index) => binding(dependency, index === 0)),
    );
    expect(allowed.catalog.plan('test.main').order).toHaveLength(20);
  });
  it('rejects changed approvals and downgrades, then reloads only after an update batch finishes', async () => {
    const first = entry('test.a'),
      updated = entry('test.a', {}, '1.1.0');
    const { catalog, snapshot, order } = await setup([updated], [binding(first)]);
    const approval = catalog.plan('test.a');
    snapshot.catalog.plugins[0] = {
      ...updated,
      manifest: { ...updated.manifest, permissions: [] },
    };
    await expect(catalog.install('test.a', approval)).rejects.toThrow('重新确认');
    snapshot.catalog.plugins[0] = updated;
    await catalog.install('test.a', catalog.plan('test.a'));
    expect(order).toEqual(['install:test.a', 'reload']);
    const previous = await setup([first], [binding(updated)]);
    expect(() => previous.catalog.plan('test.a')).toThrow('降级');
  });
});

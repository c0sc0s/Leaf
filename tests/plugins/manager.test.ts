import { describe, expect, it, vi } from 'vitest';
import type { PluginBinding, PluginManifest, PreparedPluginPackage } from '@leaf/contracts/plugins';
import { PluginManager } from '../../src/core/plugins/manager';
import { PluginRegistry } from '../../src/core/plugins/registry';
import { ResourceScope } from '@leaf/shared/lifecycle';
const manifest = (id: string): PluginManifest => ({
  id,
  name: id,
  description: 'Reader',
  version: '1.0.0',
  hostApi: '^1.0.0',
  entries: { renderer: 'renderer.js' },
  contributes: { documentProviders: [id + '.document'], views: [id + '.view'] },
  dependencies: {},
  permissions: [],
});
function setup() {
  const bindings: PluginBinding[] = ['test.pdf', 'test.markdown'].map((id, index) => ({
    manifest: manifest(id),
    enabled: !index,
    moduleURL: id,
    installedAt: 0,
    packageHash: 'a'.repeat(64),
  }));
  const registry = new PluginRegistry(),
    failure = new Set<string>(),
    order: string[] = [];
  const platform = {
    list: async () => bindings,
    prepare: vi.fn(async (_data?: Uint8Array): Promise<PreparedPluginPackage | null> => null),
    install: vi.fn(async (_data: Uint8Array): Promise<PluginBinding> => {
      const binding = { ...bindings[0], manifest: manifest('test.text') };
      bindings.push(binding);
      return binding;
    }),
    enable: async (id: string, enabled: boolean) => {
      order.push('enable:' + id);
      bindings.find((entry) => entry.manifest.id === id)!.enabled = enabled;
    },
    remove: async (id: string) => {
      bindings.splice(
        bindings.findIndex((entry) => entry.manifest.id === id),
        1,
      );
    },
  };
  const loader = {
    reload: vi.fn(async () => {}),
    async activate(binding: PluginBinding) {
      order.push('activate:' + binding.manifest.id);
      if (
        !bindings.find((entry) => entry.manifest.id === binding.manifest.id)?.enabled ||
        failure.has(binding.manifest.id)
      )
        throw new Error('load failed');
      const scope = new ResourceScope(),
        id = binding.manifest.id;
      scope.own(
        registry.register(id, 'documentProviders', id + '.document', {
          id: id + '.document',
          formats: [],
        }),
      );
      scope.own(
        registry.register(id, 'views', id + '.view', {
          id: id + '.view',
          providerId: id + '.document',
        }),
      );
      return scope;
    },
  };
  const before = vi.fn(async () => {}),
    manager = new PluginManager(platform, loader, registry, before);
  return { manager, registry, bindings, failure, order, before, platform };
}
describe('plugin lifecycle', () => {
  it('enables resources before activation and retains the last usable reader', async () => {
    const { manager, registry, order } = setup();
    await manager.initialize();
    await expect(manager.setEnabled('test.pdf', false)).rejects.toThrow('至少');
    await manager.setEnabled('test.markdown', true);
    expect(order.slice(-2)).toEqual(['enable:test.markdown', 'activate:test.markdown']);
    await manager.setEnabled('test.pdf', false);
    expect(registry.hasReader('test.pdf')).toBe(false);
    expect(registry.hasReader('test.markdown')).toBe(true);
    await manager.dispose();
    expect(registry.providers()).toHaveLength(0);
  });
  it('rolls back failed enablement and reports a repairable failure', async () => {
    const { manager, registry, failure, bindings } = setup();
    await manager.initialize();
    failure.add('test.markdown');
    await expect(manager.setEnabled('test.markdown', true)).rejects.toThrow('load failed');
    expect(bindings[1].enabled).toBe(false);
    expect(registry.hasReader('test.pdf')).toBe(true);
    failure.clear();
    await manager.setEnabled('test.markdown', true);
    expect(manager.state.get().find((entry) => entry.manifest.id === 'test.markdown')?.status).toBe(
      'active',
    );
    await manager.dispose();
  });
  it('keeps reading sessions open when installation is cancelled or adds a different plugin', async () => {
    const { manager, before, platform, registry } = setup();
    await manager.initialize();
    await manager.install();
    expect(before).not.toHaveBeenCalled();
    expect(platform.install).not.toHaveBeenCalled();
    platform.prepare.mockResolvedValueOnce({
      manifest: manifest('test.text'),
      data: new Uint8Array([1]),
    });
    await manager.install();
    expect(before).not.toHaveBeenCalled();
    expect(registry.hasReader('test.text')).toBe(true);
    await manager.dispose();
  });
});

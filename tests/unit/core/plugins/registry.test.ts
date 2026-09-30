import { describe, expect, it } from 'vitest';
import { PluginRegistry } from '../../../../src/core/plugins/registry';

describe('plugin contribution ownership', () => {
  it('rejects duplicate contributions without replacing the first plugin', () => {
    const registry = new PluginRegistry();
    const implementation = { id: 'example.panel' };
    registry.register('example.one', 'panels', implementation.id, implementation);
    expect(() => registry.register('example.two', 'panels', implementation.id, {})).toThrow(
      'Duplicate',
    );
    expect(registry.resolve('panels', implementation.id)).toBe(implementation);
  });

  it('keeps replacement registrations when an old disposal is called again', () => {
    const registry = new PluginRegistry();
    const previous = registry.register('example.one', 'panels', 'example.panel', {});
    previous.dispose();
    const replacement = { id: 'example.panel' };
    registry.register('example.two', 'panels', 'example.panel', replacement);
    const revision = registry.revision.get();
    previous.dispose();
    expect(registry.resolve('panels', 'example.panel')).toBe(replacement);
    expect(registry.revision.get()).toBe(revision);
  });

  it('counts a reading capability only when the provider and view belong to the same plugin', () => {
    const registry = new PluginRegistry();
    registry.register('example.one', 'documentProviders', 'example.document', {
      id: 'example.document',
    });
    registry.register('example.two', 'views', 'example.view', { providerId: 'example.document' });
    expect(registry.hasReader('example.one')).toBe(false);
    expect(registry.hasReader('example.two')).toBe(false);
    registry.register('example.one', 'views', 'example.own-view', {
      providerId: 'example.document',
    });
    expect(registry.hasReader('example.one')).toBe(true);
  });
});

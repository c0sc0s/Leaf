import { describe, expect, it, vi } from 'vitest';
import type { PluginHostAPI, PluginManifest } from '@leaf/contracts';
import { ResourceScope } from '@leaf/shared/lifecycle';
import { createPluginContext, type ContributionSink } from '../../src/context';

function setup() {
  const manifest: PluginManifest = {
    id: 'example.feature',
    name: 'Feature',
    description: 'Feature extension',
    version: '1.0.0',
    hostApi: '^1.0.0',
    entries: { renderer: 'renderer.js' },
    contributes: { panels: ['example.feature.panel'] },
    permissions: [],
    dependencies: {},
  };
  const host: PluginHostAPI = {
    reading: { active: () => null },
    library: { list: async () => [] },
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      list: async () => [],
    },
    backend: {
      request: async () => {
        throw new Error('Unexpected backend access');
      },
      stream: async () => {
        throw new Error('Unexpected backend access');
      },
    },
    tasks: { report: async () => {}, list: async () => [] },
    notify() {},
  };
  const dispose = vi.fn();
  const register = vi.fn<ContributionSink['register']>(() => ({ dispose }));
  const scope = new ResourceScope();
  const context = createPluginContext(manifest, host, { register }, scope);
  const panel = { id: 'example.feature.panel', label: 'Panel', mount: () => ({ dispose() {} }) };
  return { context, scope, register, dispose, panel };
}

describe('plugin registration scope', () => {
  it('assigns declared contributions to their plugin and removes them on shutdown', async () => {
    const { context, scope, register, dispose, panel } = setup();
    context.registerPanel(panel);
    expect(register).toHaveBeenCalledWith('example.feature', 'panels', panel.id, panel);
    await scope.dispose();
    await scope.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects undeclared contributions before registering them', () => {
    const { context, register, panel } = setup();
    expect(() => context.registerPanel({ ...panel, id: 'another.panel' })).toThrow('Undeclared');
    expect(register).not.toHaveBeenCalled();
  });

  it('does not retain a contribution registered after its plugin has stopped', async () => {
    const { context, scope, dispose, panel } = setup();
    await scope.dispose();
    expect(() => context.registerPanel(panel)).toThrow('closed');
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

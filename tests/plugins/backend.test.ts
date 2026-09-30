import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openStorage } from '../../electron/storage/repositories/index.ts';
import { PluginInstaller } from '../../electron/plugins/installer.ts';
import { BackendManager } from '../../electron/plugins/backend/manager.ts';
import { nodeBackendProcess } from '../../electron/plugins/backend/node.ts';
import { CredentialVault, developmentCipher } from '../../electron/platform/credentials.ts';
import { writePackage } from '../../electron/plugins/package.ts';
import type { PluginManifest } from '@leaf/contracts/plugins';
it('starts a backend lazily, scopes its services and cancels an in-flight stream', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-backend-')),
    storage = openStorage(path.join(root, 'storage'));
  const transport = {
    request: async <K extends import('@leaf/contracts/transport').StorageOperation>(
      operation: K,
      input: import('@leaf/contracts/transport').StorageInput<K>,
    ) => storage.request(operation, input),
  };
  const installer = new PluginInstaller(path.join(root, 'plugins'), transport, () => 'unused');
  const vault = new CredentialVault(
    path.join(root, 'credentials.json'),
    await developmentCipher(path.join(root, 'key')),
  );
  const manifest: PluginManifest = {
    id: 'test.backend',
    name: 'Backend',
    description: 'Backend test',
    version: '1.0.0',
    hostApi: '^1.0.0',
    entries: { renderer: 'renderer.js', backend: 'backend.js' },
    contributes: {},
    permissions: ['backend', 'storage', 'credentials'],
    dependencies: {},
  };
  const backendSource = `export default (host) => ({ async request(method, input, signal) { signal.throwIfAborted(); if (method === 'save') { await host.storage.set('value', input); await host.credentials.set('key', 'secret'); return host.environment; } return { saved: await host.storage.get('value'), secret: await host.credentials.get('key') }; }, async stream(method, input, signal, emit) { emit('first'); await new Promise((resolve,reject) => { signal.addEventListener('abort', () => reject(signal.reason), {once:true}); }); emit('obsolete'); }, dispose() {} });`;
  await installer.install(
    writePackage(
      manifest,
      new Map([
        ['renderer.js', new TextEncoder().encode('export default {activate(){}};')],
        ['backend.js', new TextEncoder().encode(backendSource)],
      ]),
    ),
  );
  let launches = 0;
  const manager = new BackendManager(
    installer,
    transport,
    vault,
    () => {
      launches++;
      return nodeBackendProcess();
    },
    { LEAF_BACKEND_MODEL: 'mock', OTHER_SECRET: 'hidden' },
  );
  try {
    expect(launches).toBe(0);
    expect(
      await manager.request(
        { pluginId: 'test.backend', method: 'save', input: { text: 'saved' } },
        new AbortController().signal,
      ),
    ).toEqual({ LEAF_BACKEND_MODEL: 'mock' });
    expect(
      await manager.request(
        { pluginId: 'test.backend', method: 'load' },
        new AbortController().signal,
      ),
    ).toEqual({ saved: { text: 'saved' }, secret: 'secret' });
    expect(launches).toBe(1);
    expect(await vault.get('another.plugin', 'key')).toBeNull();
    const controller = new AbortController(),
      events: unknown[] = [];
    await expect(
      manager.stream({ pluginId: 'test.backend', method: 'hang' }, controller.signal, (event) => {
        events.push(event);
        controller.abort();
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(events).toEqual(['first']);
    await manager.stop('test.backend');
    await manager.request(
      { pluginId: 'test.backend', method: 'load' },
      new AbortController().signal,
    );
    expect(launches).toBe(2);
  } finally {
    await manager.dispose();
    storage.close();
    await rm(root, { recursive: true, force: true });
  }
});

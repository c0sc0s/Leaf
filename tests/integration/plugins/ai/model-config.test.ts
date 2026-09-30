import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { BackendHostAPI } from '@leaf/contracts/host';
import type { JsonValue } from '@leaf/shared/types';
import { createModelConfig } from '../../../../plugins/ai/src/models/config.ts';
import { CredentialVault, developmentCipher } from '../../../../electron/platform/credentials.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function config(environment: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-model-config-'));
  roots.push(root);
  const file = path.join(root, 'credentials.json'),
    vault = new CredentialVault(file, await developmentCipher(path.join(root, 'key'))),
    values = new Map<string, JsonValue>();
  const host: BackendHostAPI = {
    environment,
    credentials: {
      get: (key) => vault.get('leaf.ai', key),
      set: (key, value) => vault.set('leaf.ai', key, value),
    },
    storage: {
      get: async <T extends JsonValue>(key: string) => (values.get(key) as T) ?? null,
      set: async (key, value) => {
        values.set(key, value);
      },
      delete: async (key) => {
        values.delete(key);
      },
      list: async () => [],
    },
  };
  return { model: createModelConfig(host), file, values, vault };
}
describe('model configuration', () => {
  it('stores keys encrypted and separately from settings, preserves an omitted key, and scopes credentials', async () => {
    const { model, file, values, vault } = await config();
    expect(await model.read()).toBeNull();
    await model.write({ baseURL: 'https://example.com/v1/', model: 'reader', apiKey: 'sk-secret' });
    expect(await readFile(file, 'utf8')).not.toContain('sk-secret');
    expect(values.get('model.configuration')).toEqual({
      baseURL: 'https://example.com/v1',
      model: 'reader',
    });
    await model.write({ baseURL: 'https://example.com/v1', model: 'other' });
    expect(await model.read()).toMatchObject({ model: 'other', apiKey: 'sk-secret' });
    expect(await model.summary()).toEqual({
      baseURL: 'https://example.com/v1',
      model: 'other',
      hasKey: true,
      managed: false,
    });
    expect(await vault.get('another.plugin', 'model.apiKey')).toBeNull();
  });
  it('rejects malformed settings and a first save without a key', async () => {
    const { model } = await config();
    for (const input of [
      { baseURL: 'ftp://x', model: 'm', apiKey: 'k' },
      { baseURL: 'https://user:secret@x', model: 'm', apiKey: 'k' },
      { baseURL: 'https://x', model: '', apiKey: 'k' },
      { baseURL: 'https://x', model: 'm' },
    ])
      await expect(model.write(input as JsonValue)).rejects.toThrow();
  });
  it('uses environment configuration without copying the key to storage', async () => {
    const { model, values } = await config({
      LEAF_AI_API_KEY: 'env-key',
      LEAF_AI_BASE_URL: 'http://127.0.0.1:1/v1',
      LEAF_AI_MODEL: 'mock',
    });
    expect(await model.read()).toEqual({
      baseURL: 'http://127.0.0.1:1/v1',
      model: 'mock',
      apiKey: 'env-key',
    });
    expect(await model.summary()).toMatchObject({ managed: true, hasKey: true });
    expect(values.size).toBe(0);
    await expect(model.write({ baseURL: 'https://x', model: 'm', apiKey: 'k' })).rejects.toThrow();
  });
});

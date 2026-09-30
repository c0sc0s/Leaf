import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAiConfig } from '../electron/ai/config.ts';

const directories: string[] = [];
afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});
function file() {
  const root = mkdtempSync(path.join(tmpdir(), 'leaf-ai-config-'));
  directories.push(root);
  return path.join(root, 'ai.json');
}
const cipher = {
  encrypt: (text: string) => `sealed:${text}`,
  decrypt: (text: string) => text.slice('sealed:'.length),
};

describe('AI config', () => {
  it('stores the key encrypted, never exposes it, and keeps it when a save omits it', () => {
    const target = file();
    const config = createAiConfig(target, cipher, {});
    expect(config.read()).toBeNull();
    expect(config.summary()).toEqual({ baseURL: '', model: '', hasKey: false, managed: false });
    config.write({ baseURL: 'https://api.deepseek.com/', model: 'deepseek-chat', apiKey: 'sk-1' });
    expect(readFileSync(target, 'utf8')).not.toContain('"sk-1"');
    expect(config.summary()).toEqual({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      hasKey: true,
      managed: false,
    });
    config.write({ baseURL: 'https://api.deepseek.com', model: 'deepseek-reasoner' });
    expect(config.read()).toEqual({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-reasoner',
      apiKey: 'sk-1',
    });
  });

  it('rejects invalid settings and a first save without a key', () => {
    const config = createAiConfig(file(), cipher, {});
    expect(() => config.write({ baseURL: 'ftp://x', model: 'm', apiKey: 'k' })).toThrow(/https/);
    expect(() => config.write({ baseURL: 'https://x', model: ' ', apiKey: 'k' })).toThrow();
    expect(() => config.write({ baseURL: 'https://x', model: 'm' })).toThrow(/API Key/);
  });

  it('lets environment variables take over and locks the form', () => {
    const config = createAiConfig(file(), cipher, {
      LEAF_AI_API_KEY: 'env-key',
      LEAF_AI_BASE_URL: 'http://127.0.0.1:1/v1',
      LEAF_AI_MODEL: 'mock',
    });
    expect(config.read()).toEqual({
      baseURL: 'http://127.0.0.1:1/v1',
      model: 'mock',
      apiKey: 'env-key',
    });
    expect(config.summary()).toMatchObject({ hasKey: true, managed: true });
    expect(() => config.write({ baseURL: 'https://x', model: 'm', apiKey: 'k' })).toThrow();
  });
});

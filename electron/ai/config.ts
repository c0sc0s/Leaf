import fs from 'node:fs';
import path from 'node:path';
import type { AiConfigInput, AiConfigSummary } from '../contract.ts';
import type { ModelSettings } from './chat.ts';

/** Protects the API key at rest. */
export interface Cipher {
  encrypt(text: string): string;
  decrypt(text: string): string;
}

type Environment = Record<string, string | undefined>;

interface SavedConfig {
  baseURL: string;
  model: string;
  /** Encrypted with the cipher. */
  apiKey: string;
}

function readEnvironment(env: Environment): ModelSettings | null {
  if (!env.LEAF_AI_API_KEY) return null;
  return {
    baseURL: env.LEAF_AI_BASE_URL || 'https://api.deepseek.com',
    model: env.LEAF_AI_MODEL || 'deepseek-chat',
    apiKey: env.LEAF_AI_API_KEY,
  };
}

function validateSettings(input: unknown) {
  const { baseURL, model, apiKey } = (input ?? {}) as Partial<Record<keyof AiConfigInput, unknown>>;
  if (typeof baseURL !== 'string' || typeof model !== 'string' || !model.trim())
    throw new Error('请填写服务地址和模型名称');
  const url = URL.parse(baseURL.trim());
  if (!url || !['https:', 'http:'].includes(url.protocol))
    throw new Error('服务地址需要是以 https:// 开头的网址');
  if (apiKey !== undefined && (typeof apiKey !== 'string' || !apiKey.trim()))
    throw new Error('API Key 不能为空');
  return {
    baseURL: url.href.replace(/\/$/, ''),
    model: model.trim(),
    apiKey: (apiKey as string | undefined)?.trim(),
  };
}

/**
 * Keeps the model service settings in one JSON file. Environment variables (LEAF_AI_*) take
 * precedence so tests and CI never touch the file.
 */
export function createAiConfig(file: string, cipher: Cipher, env: Environment = process.env) {
  const load = (): SavedConfig | null => {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  return {
    /** The full settings, including the decrypted key, or null when not configured. */
    read(): ModelSettings | null {
      const fromEnvironment = readEnvironment(env);
      if (fromEnvironment) return fromEnvironment;
      const saved = load();
      if (!saved?.apiKey) return null;
      return { baseURL: saved.baseURL, model: saved.model, apiKey: cipher.decrypt(saved.apiKey) };
    },
    /** What the renderer may see: never the key itself. */
    summary(): AiConfigSummary {
      const fromEnvironment = readEnvironment(env);
      const saved = fromEnvironment ?? load();
      return {
        baseURL: saved?.baseURL ?? '',
        model: saved?.model ?? '',
        hasKey: Boolean(saved?.apiKey),
        managed: Boolean(fromEnvironment),
      };
    },
    /** Omitting apiKey keeps the saved one, so the settings form never needs to read it back. */
    write(input: unknown) {
      if (readEnvironment(env)) throw new Error('模型服务由环境变量配置，无法在这里修改');
      const next = validateSettings(input);
      const previous = load();
      const apiKey = next.apiKey ? cipher.encrypt(next.apiKey) : previous?.apiKey;
      if (!apiKey) throw new Error('请填写 API Key');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      const saved: SavedConfig = { baseURL: next.baseURL, model: next.model, apiKey };
      fs.writeFileSync(temporary, JSON.stringify(saved));
      fs.renameSync(temporary, file);
    },
  };
}

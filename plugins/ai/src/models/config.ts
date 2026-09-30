import type { BackendHostAPI } from '@leaf/contracts/host';
import type { AiConfigSummary } from './types';
import type { ModelSettings } from './provider';
import { jsonObject } from '@leaf/shared/types';
import type { JsonValue } from '@leaf/shared/types';

export function validateSettings(input: unknown) {
  const value = jsonObject(input);
  if (typeof value.baseURL !== 'string' || typeof value.model !== 'string' || !value.model.trim())
    throw new Error('请填写服务地址和模型名称');
  const url = URL.parse(value.baseURL.trim());
  if (!url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('服务地址需要是 http 或 https 网址');
  if (value.apiKey !== undefined && (typeof value.apiKey !== 'string' || !value.apiKey.trim()))
    throw new Error('API Key 不能为空');
  return {
    baseURL: url.href.replace(/\/$/, ''),
    model: value.model.trim(),
    ...(value.apiKey === undefined ? {} : { apiKey: String(value.apiKey).trim() }),
  };
}
export function createModelConfig(host: BackendHostAPI) {
  const managed = (): ModelSettings | null =>
    host.environment.LEAF_AI_API_KEY
      ? {
          baseURL: host.environment.LEAF_AI_BASE_URL || 'https://api.deepseek.com',
          model: host.environment.LEAF_AI_MODEL || 'deepseek-chat',
          apiKey: host.environment.LEAF_AI_API_KEY,
        }
      : null;
  const load = async () => {
    const value = await host.storage.get('model.configuration');
    return value ? validateSettings(value) : null;
  };
  return {
    async read(): Promise<ModelSettings | null> {
      const env = managed();
      if (env) return env;
      const saved = await load(),
        apiKey = await host.credentials.get('model.apiKey');
      return saved && apiKey ? { ...saved, apiKey } : null;
    },
    async summary(): Promise<AiConfigSummary> {
      const env = managed(),
        saved = env ?? (await load());
      return {
        baseURL: saved?.baseURL ?? '',
        model: saved?.model ?? '',
        hasKey: !!env || !!(await host.credentials.get('model.apiKey')),
        managed: !!env,
      };
    },
    async write(input: JsonValue) {
      if (managed()) throw new Error('模型服务由环境变量配置，无法在这里修改');
      const next = validateSettings(input),
        previous = await host.credentials.get('model.apiKey');
      if (!next.apiKey && !previous) throw new Error('请填写 API Key');
      if (next.apiKey) await host.credentials.set('model.apiKey', next.apiKey);
      await host.storage.set('model.configuration', { baseURL: next.baseURL, model: next.model });
    },
  };
}

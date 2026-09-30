import type { BackendHostAPI, BackendPlugin } from '@leaf/contracts/host';
import type { JsonValue } from '@leaf/shared/types';
import { createModelConfig } from '../models/config';
import { streamChat } from '../models/provider';

export default function activate(host: BackendHostAPI): BackendPlugin {
  const config = createModelConfig(host);
  return {
    async request(method, input, signal) {
      signal.throwIfAborted();
      if (method === 'config') return (await config.summary()) as unknown as JsonValue;
      if (method === 'configure') {
        await config.write(input ?? null);
        return (await config.summary()) as unknown as JsonValue;
      }
      throw new Error('未知的模型服务操作');
    },
    async stream(method, input, signal, emit) {
      if (method !== 'chat') throw new Error('未知的模型任务');
      const settings = await config.read();
      if (!settings) {
        emit({ type: 'error', code: 'unconfigured', message: '请先在设置中配置模型服务' });
        return;
      }
      await streamChat(settings, input, signal, (event) => emit(event as unknown as JsonValue));
    },
    dispose() {},
  };
}

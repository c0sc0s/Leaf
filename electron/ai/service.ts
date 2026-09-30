import type { ChatEvent } from '../contract.ts';
import { streamChat, type ModelSettings } from './chat.ts';
import { createAiConfig, type Cipher } from './config.ts';

export type AiService = ReturnType<typeof createAiService>;

/** The model service as seen by a transport (Electron IPC or the Vite dev server). */
export function createAiService({
  file,
  cipher,
  env,
}: {
  file: string;
  cipher: Cipher;
  env: Record<string, string | undefined>;
}) {
  const config = createAiConfig(file, cipher, env);
  return {
    summary: () => config.summary(),
    configure(input: unknown) {
      config.write(input);
      return config.summary();
    },
    async chat(request: unknown, signal: AbortSignal, emit: (event: ChatEvent) => void) {
      let settings: ModelSettings | null;
      try {
        settings = config.read();
      } catch (error) {
        emit({
          type: 'error',
          code: 'config',
          message: `模型服务配置无法读取：${(error as Error).message}`,
        });
        return;
      }
      if (!settings) {
        emit({ type: 'error', code: 'unconfigured', message: '还没有配置模型服务' });
        return;
      }
      await streamChat(settings, request, signal, emit);
    },
  };
}

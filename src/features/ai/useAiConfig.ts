import { useEffect, useState } from 'react';
import { readAiConfig } from '@/ai/transport';
import type { AiConfigSummary } from '@/ai/types';

export type AiConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: AiConfigSummary }
  | { status: 'error'; message: string };

/** The model service summary, refreshed whenever the settings form saves. */
export function useAiConfig(): AiConfigState {
  const [state, setState] = useState<AiConfigState>({ status: 'loading' });
  useEffect(() => {
    let disposed = false;
    const load = () =>
      readAiConfig().then(
        (config) => !disposed && setState({ status: 'ready', config }),
        (error: Error) => !disposed && setState({ status: 'error', message: error.message }),
      );
    void load();
    window.addEventListener('leaf:ai-config', load);
    return () => {
      disposed = true;
      window.removeEventListener('leaf:ai-config', load);
    };
  }, []);
  return state;
}

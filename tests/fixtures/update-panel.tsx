import { createRoot } from 'react-dom/client';
import type { UpdateState, UpdatesAPI } from '@leaf/contracts/transport';
import { UpdatesClient } from '../../src/platform/updates';
import { UpdatePanel, UpdateNotice } from '../../src/app/about/UpdatePanel';

let state: UpdateState = {
  status: 'idle',
  currentVersion: '1.5.2',
  installMode: 'automatic',
  reason: null,
  release: null,
  progress: null,
  error: null,
};
const listeners = new Set<(state: UpdateState) => void>();
const calls: string[] = [];
let saveFailure = false;
const publish = (patch: Partial<UpdateState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
};
const api: UpdatesAPI = {
  getState: async () => state,
  subscribe: (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  check: async () => {
    calls.push('check');
    publish({ status: 'checking' });
  },
  download: async () => {
    calls.push('download');
    publish({ status: 'downloading', progress: 0 });
  },
  install: async () => {
    calls.push('install');
    if (saveFailure) throw new Error('笔记未保存，请重试');
    publish({ status: 'installing' });
  },
  openRelease: async () => {
    calls.push('open');
  },
};
Object.assign(window, {
  updateFixture: {
    publish,
    calls,
    failSave: (value: boolean) => {
      saveFailure = value;
    },
  },
});
const updates = new UpdatesClient(api, '1.5.2');
await updates.connect();
createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 32, maxWidth: 520 }}>
    <UpdatePanel updates={updates} />
    <UpdateNotice
      updates={updates}
      onOpen={() => {
        calls.push('notice');
      }}
    />
  </div>,
);

declare global {
  interface Window {
    updateFixture: {
      publish(patch: Partial<UpdateState>): void;
      calls: string[];
      failSave(value: boolean): void;
    };
  }
}

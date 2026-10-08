import { describe, expect, it, vi } from 'vitest';
import type { UpdateState, UpdatesAPI } from '@leaf/contracts/transport';
import { UpdatesClient } from '../../../src/platform/updates.ts';
import { deferred } from '../../fixtures/deferred.ts';

const initial: UpdateState = {
  status: 'idle',
  currentVersion: '1.5.2',
  installMode: 'automatic',
  reason: null,
  release: null,
  error: null,
  progress: null,
};

describe('renderer update transport', () => {
  it('keeps newer events when the initial snapshot arrives late', async () => {
    const snapshot = deferred<UpdateState>();
    let listener!: (state: UpdateState) => void;
    const unsubscribe = vi.fn();
    const api: UpdatesAPI = {
      getState: () => snapshot.promise,
      subscribe: (callback) => {
        listener = callback;
        return unsubscribe;
      },
      check: vi.fn(),
      download: vi.fn(),
      install: vi.fn(),
      openRelease: vi.fn(),
    };
    const updates = new UpdatesClient(api, '1.5.2');
    const connecting = updates.connect();
    listener({ ...initial, status: 'checking' });
    snapshot.resolve(initial);
    const disconnect = await connecting;
    expect(updates.state.get().status).toBe('checking');
    disconnect();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('disables updating outside the desktop without creating a network client', async () => {
    const updates = new UpdatesClient(undefined, '1.5.2');
    await updates.connect();
    expect(updates.state.get()).toMatchObject({
      status: 'disabled',
      reason: '请在桌面应用中检查更新',
    });
    expect(() => updates.check()).toThrow('桌面应用');
  });
});

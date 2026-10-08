import { afterEach, describe, expect, it, vi } from 'vitest';
import { RendererFlush } from '../../../../electron/platform/rendererFlush.ts';

afterEach(() => vi.useRealTimers());

describe('renderer save handshake', () => {
  it('requires readiness and accepts only the matching acknowledgement', async () => {
    const send = vi.fn();
    const flush = new RendererFlush(send);
    await expect(flush.flush()).rejects.toThrow('尚未准备好');
    flush.markReady();
    const pending = flush.flush();
    expect(flush.flush()).toBe(pending);
    expect(send).toHaveBeenCalledTimes(1);
    flush.acknowledge('unrelated');
    flush.acknowledge(send.mock.calls[0][0]);
    await pending;
  });

  it('rejects save failures and permits another save request', async () => {
    const send = vi.fn();
    const flush = new RendererFlush(send);
    flush.markReady();
    const pending = flush.flush();
    flush.acknowledge(send.mock.calls[0][0], 'disk full');
    await expect(pending).rejects.toThrow('disk full');
    const retry = flush.flush();
    flush.acknowledge(send.mock.calls[1][0]);
    await retry;
  });

  it('times out without letting a late acknowledgement complete the retry', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const flush = new RendererFlush(send, 100);
    flush.markReady();
    const pending = flush.flush();
    const rejected = expect(pending).rejects.toThrow('保存未完成');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    const retry = flush.flush();
    let saved = false;
    void retry.then(() => {
      saved = true;
    });
    flush.acknowledge(send.mock.calls[0][0]);
    await Promise.resolve();
    expect(saved).toBe(false);
    flush.acknowledge(send.mock.calls[1][0]);
    await retry;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts an outstanding save on renderer loss and waits for readiness again', async () => {
    const flush = new RendererFlush(() => {});
    flush.markReady();
    const pending = flush.flush();
    flush.reset();
    await expect(pending).rejects.toThrow('重新加载或关闭');
    await expect(flush.flush()).rejects.toThrow('尚未准备好');
  });
});

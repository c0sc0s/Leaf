export class ReadingScheduler {
  private foregroundUntil = 0;
  private lastYield = performance.now();
  busy = () => {
    this.foregroundUntil = performance.now() + 350;
  };
  async checkpoint(signal?: AbortSignal) {
    signal?.throwIfAborted();
    // Yield after a time slice, rather than imposing a delay on every PDF page.
    if (performance.now() >= this.foregroundUntil && performance.now() - this.lastYield < 8) return;
    while (performance.now() < this.foregroundUntil) {
      await this.yield(40, signal);
    }
    await this.yield(0, signal);
    this.lastYield = performance.now();
    signal?.throwIfAborted();
  }

  private yield(delay: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(signal?.reason);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}

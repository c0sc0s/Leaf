export class ReadingScheduler {
  private foregroundUntil = 0;
  busy = () => {
    this.foregroundUntil = performance.now() + 350;
  };
  async checkpoint(signal?: AbortSignal) {
    do {
      signal?.throwIfAborted();
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    } while (performance.now() < this.foregroundUntil);
    signal?.throwIfAborted();
    await new Promise<void>((resolve) => {
      if ('requestIdleCallback' in window)
        window.requestIdleCallback(() => resolve(), { timeout: 250 });
      else setTimeout(resolve, 20);
    });
    signal?.throwIfAborted();
  }
}

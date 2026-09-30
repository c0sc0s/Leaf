export class PersistenceCoordinator {
  private pending = new Set<Promise<unknown>>();
  private flushers = new Set<() => Promise<void>>();
  private failures = new Map<string, unknown>();

  track<T>(promise: Promise<T>, key?: string): Promise<T> {
    this.pending.add(promise);
    void promise.then(
      () => {
        this.pending.delete(promise);
        if (key) this.failures.delete(key);
      },
      (error) => {
        this.pending.delete(promise);
        if (key) this.failures.set(key, error);
      },
    );
    return promise;
  }
  register(flush: () => Promise<void>) {
    this.flushers.add(flush);
    return () => {
      this.flushers.delete(flush);
    };
  }
  forget(prefix: string) {
    for (const key of this.failures.keys()) if (key.startsWith(prefix)) this.failures.delete(key);
  }
  async flush() {
    for (const flush of Array.from(this.flushers)) await flush();
    while (this.pending.size) await Promise.allSettled(this.pending);
    if (this.failures.size)
      throw new AggregateError([...this.failures.values()], '存在未保存的数据');
  }
}

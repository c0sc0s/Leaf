export interface Disposable {
  dispose(): void | Promise<void>;
}

export class ResourceScope implements Disposable {
  private resources: Disposable[] = [];
  private closing: Promise<void> | undefined;
  readonly controller = new AbortController();
  get signal() {
    return this.controller.signal;
  }

  own<T extends Disposable>(resource: T): T {
    if (this.signal.aborted) {
      void Promise.resolve()
        .then(() => resource.dispose())
        .catch(() => {});
      throw new Error('Resource scope is closed');
    }
    this.resources.push(resource);
    return resource;
  }

  dispose(): Promise<void> {
    if (!this.closing) {
      this.controller.abort();
      this.closing = (async () => {
        const errors: unknown[] = [];
        for (const resource of this.resources.splice(0).reverse()) {
          try {
            await resource.dispose();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) throw new AggregateError(errors, 'Resource release failed');
      })();
    }
    return this.closing;
  }
}

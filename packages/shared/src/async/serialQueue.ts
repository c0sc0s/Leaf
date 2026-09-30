export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    // Failure belongs to its caller; later imports still get their turn.
    this.tail = next.catch(() => {});
    return next;
  }
}

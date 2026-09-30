import type { Disposable } from '../lifecycle/index.ts';

export class EventSource<T> {
  private listeners = new Set<(event: T) => void>();
  subscribe(listener: (event: T) => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }
  emit(event: T) {
    for (const listener of Array.from(this.listeners)) listener(event);
  }
  clear() {
    this.listeners.clear();
  }
}

export class Store<T> {
  private events = new EventSource<void>();
  private value: T;
  constructor(value: T) {
    this.value = value;
  }
  get = () => this.value;
  subscribe = (listener: () => void) => {
    const subscription = this.events.subscribe(listener);
    return () => {
      void subscription.dispose();
    };
  };
  set(value: T) {
    this.value = value;
    this.events.emit();
  }
  update(change: (value: T) => T) {
    this.set(change(this.value));
  }
}

import { useCallback, useSyncExternalStore } from 'react';
import type { ReadingLocation } from '../../../types';

export interface LocationStore {
  get: () => ReadingLocation;
  set: (location: ReadingLocation) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createLocationStore(initial: ReadingLocation): LocationStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// The selector must return a primitive so scroll updates re-render only when its result changes.
export function useLocation<T extends string | number | boolean>(
  store: LocationStore,
  select: (location: ReadingLocation) => T,
) {
  const snapshot = useCallback(() => select(store.get()), [store, select]);
  return useSyncExternalStore(store.subscribe, snapshot);
}

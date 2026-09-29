import { useEffect, useState } from 'react';

/** Mirrors `value`, but only after it has stayed set for `ms`; clears immediately. */
export function useDelayed<T>(value: T | null, ms: number) {
  const [shown, setShown] = useState<T | null>(null);
  useEffect(() => {
    if (value === null) return setShown(null);
    const timer = window.setTimeout(() => setShown(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return value === null ? null : shown;
}

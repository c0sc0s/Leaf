import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION = 5500;

/** A single transient status message; a new message replaces the current one. */
export function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setMessage('');
  }, []);
  const notify = useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(''), TOAST_DURATION);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, notify, dismiss };
}

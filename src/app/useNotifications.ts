import { useCallback, useEffect, useRef, useState } from 'react';

export function useNotifications() {
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearToast = useCallback(() => {
    clearTimeout(timer.current);
    setToast('');
  }, []);
  const notify = useCallback((message: string) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), 5500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, notify, clearToast };
}

import { registerStorageFlusher } from '../../../lib/storageClient';
import { useCallback, useEffect, useRef } from 'react';
import type { ReadingState } from '../../../types';
import { saveReadingState } from '../../../lib/position';

export function useReadingPersistence({
  bookId,
  page,
  enabled,
  capture,
  onProgress,
  notify,
}: {
  bookId: string;
  page: number;
  enabled: boolean;
  capture: () => ReadingState;
  onProgress: (page: number, openedAt: number) => void;
  notify: (message: string) => void;
}) {
  const latest = useRef({ capture, onProgress, notify });
  latest.current = { capture, onProgress, notify };
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSaved = useRef('');
  const reported = useRef(false);

  const persist = useCallback(async () => {
    try {
      const state = latest.current.capture();
      const serialized = JSON.stringify(state);
      if (serialized === lastSaved.current) return;
      await saveReadingState(bookId, state);
      lastSaved.current = serialized;
    } catch {
      if (!reported.current) {
        reported.current = true;
        latest.current.notify('阅读位置未能保存，请检查本机存储空间');
      }
    }
  }, [bookId]);
  const saveProgress = useCallback(() => {
    latest.current.onProgress(latest.current.capture().page, Date.now());
  }, []);
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 180);
  }, [persist]);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!enabled) return;
    const delay = setTimeout(saveProgress, 1000);
    return () => clearTimeout(delay);
  }, [enabled, page, saveProgress]);
  useEffect(() => {
    if (!enabled) return;
    const unregister = registerStorageFlusher(async () => {
      await persist();
      saveProgress();
    });
    const interval = setInterval(persist, 1000);
    const flush = () => {
      persist();
      saveProgress();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      unregister();
      clearInterval(interval);
      clearTimeout(timer.current);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled, persist, saveProgress]);
  return schedule;
}

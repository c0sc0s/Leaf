import { useEffect, useRef } from 'react';

export interface ReaderShortcuts {
  search: () => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  page: (direction: 1 | -1) => void;
  screen: (direction: 1 | -1) => void;
  escape: () => void;
  toggleFocus: () => void;
}

export function useReaderShortcuts(shortcuts: ReaderShortcuts) {
  const latest = useRef(shortcuts);
  latest.current = shortcuts;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const run = latest.current;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('[role=dialog],[role=menu]')) return;
      const command = e.metaKey || e.ctrlKey;
      const handle = (action: () => void) => {
        e.preventDefault();
        action();
      };
      if (command && e.key.toLowerCase() === 'f') return handle(run.search);
      if (command && (e.key === '=' || e.key === '+')) return handle(run.zoomIn);
      if (command && e.key === '-') return handle(run.zoomOut);
      if (command && e.key === '0') return handle(run.resetZoom);
      if (target?.closest('input,textarea,select,[contenteditable]')) return;
      if (command && e.key.toLowerCase() === 'z') return handle(e.shiftKey ? run.redo : run.undo);
      if (e.key === 'PageDown') return handle(() => run.screen(1));
      if (e.key === 'PageUp') return handle(() => run.screen(-1));
      if (e.key === 'ArrowRight') return handle(() => run.page(1));
      if (e.key === 'ArrowLeft') return handle(() => run.page(-1));
      if (e.key === 'Escape') return run.escape();
      if (e.key.toLowerCase() === 'f' && !command && !e.altKey) return handle(run.toggleFocus);
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
}

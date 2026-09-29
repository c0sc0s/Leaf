import { readPreference, rememberPreference } from '../../lib/preferences';
import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

interface PanelSize {
  storageKey: string;
  min: number;
  max: number;
  initial: number;
  /** The panel edge that carries the handle; dragging away from the panel widens it. */
  edge: 'left' | 'right';
}

const KEYBOARD_STEP = 16;

export function useResizablePanel<T extends HTMLElement>({
  storageKey,
  min,
  max,
  initial,
  edge,
}: PanelSize) {
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  const [width, setWidth] = useState(() => {
    const saved = Number(readPreference(storageKey));
    return Number.isFinite(saved) && saved > 0 ? clamp(saved) : initial;
  });
  const panel = useRef<T>(null);
  const direction = edge === 'right' ? 1 : -1;
  const commit = (value: number) => {
    const next = clamp(value);
    setWidth(next);
    rememberPreference(storageKey, String(next));
  };
  // Dragging writes the width straight to the element; React only hears about the final value.
  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const startX = event.clientX;
    let next = width;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing-panel');
    const move = (e: PointerEvent) => {
      next = clamp(width + (e.clientX - startX) * direction);
      panel.current?.style.setProperty('width', `${next}px`);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.body.classList.remove('resizing-panel');
      commit(next);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!key) return;
    event.preventDefault();
    commit(width + key * direction * KEYBOARD_STEP);
  };
  const handleProps = {
    className: `panel-resizer edge-${edge}`,
    role: 'separator',
    'aria-orientation': 'vertical',
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': width,
    tabIndex: 0,
    onPointerDown: drag,
    onKeyDown: keyboard,
    onDoubleClick: () => commit(initial),
  } as const;
  return { width, panel, handleProps };
}

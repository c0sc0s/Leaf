import { useEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { ViewSetting } from '@leaf/contracts/reader';
import type { ReadingSession } from '../../core/reader/session';
export function usePinchScale(
  scroller: RefObject<HTMLElement | null>,
  setting: ViewSetting | undefined,
  value: number,
  session: ReadingSession,
) {
  const current = useRef(value);
  current.current = value;
  useEffect(() => {
    const container = scroller.current;
    if (!container || !setting) return;
    let target = 0,
      timer = 0;
    const content = () => {
      const first = container.firstElementChild as HTMLElement | null;
      return first && getComputedStyle(first).display === 'contents'
        ? (first.firstElementChild as HTMLElement | null)
        : first;
    };
    const clear = () => {
      const element = content();
      if (element) {
        element.style.transform = '';
        element.style.transformOrigin = '';
        element.style.willChange = '';
      }
    };
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const element = content();
      if (!element) return;
      if (!target) {
        target = current.current;
        element.style.transformOrigin = `${container.scrollLeft + container.clientWidth / 2}px ${container.scrollTop + 24}px`;
        element.style.willChange = 'transform';
      }
      target = Math.max(
        setting!.min ?? 0.5,
        Math.min(setting!.max ?? 2, target * Math.exp(-event.deltaY * 0.01)),
      );
      element.style.transform = `scale(${target / current.current})`;
      clearTimeout(timer);
      // Commit once the gesture settles so parsing and layout do not run on every wheel event.
      timer = window.setTimeout(() => {
        const next = Math.round(target * 100) / 100;
        target = 0;
        clear();
        flushSync(() => session.setSettings({ [setting!.id]: next }));
      }, 160);
    };
    container.addEventListener('wheel', pinch, { passive: false });
    return () => {
      container.removeEventListener('wheel', pinch);
      clearTimeout(timer);
      clear();
    };
  }, [scroller, setting, session]);
}

import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { clampZoom } from '../zoom';

const PINCH_SENSITIVITY = 0.01;

/** Trackpad pinch arrives as ctrl/meta + wheel; it needs a non-passive listener to cancel scrolling. */
export function usePinchZoom(
  scroller: RefObject<HTMLElement | null>,
  setZoom: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((z) => clampZoom(z * Math.exp(-event.deltaY * PINCH_SENSITIVITY)));
    };
    container.addEventListener('wheel', pinch, { passive: false });
    return () => container.removeEventListener('wheel', pinch);
  }, [scroller, setZoom]);
}

import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import { clampZoom } from '../zoom';

const PINCH_SENSITIVITY = 0.01;
/** How long the gesture must rest before the new zoom is laid out and re-rendered. */
const SETTLE_MS = 160;
/** Matches the reading line that position capture keeps in place; see captureLocation. */
const ANCHOR_Y = 24;

/**
 * Trackpad pinch arrives as ctrl/meta + wheel, dozens of events a second. Re-laying out
 * every page per event is what made pinching stutter, so during the gesture the content
 * is only scaled on the compositor; the real zoom is committed once the gesture settles.
 * The preview scales around the same point the committed zoom keeps in place, so the
 * page does not jump when it is swapped for the re-rendered layout.
 */
export function usePinchZoom(
  scroller: RefObject<HTMLElement | null>,
  zoom: number,
  setZoom: Dispatch<SetStateAction<number>>,
) {
  const committed = useRef(zoom);
  committed.current = zoom;
  useEffect(() => {
    const container = scroller.current;
    if (!container) return;
    let target = 0;
    let timer = 0;
    const content = () => container.firstElementChild as HTMLElement | null;
    const clearPreview = () => {
      const element = content();
      if (!element) return;
      element.style.transform = '';
      element.style.transformOrigin = '';
      element.style.willChange = '';
    };
    const commit = () => {
      const next = target;
      target = 0;
      // Remove the preview and lay out the new zoom in one task, so no frame shows either alone.
      clearPreview();
      flushSync(() => setZoom(next));
    };
    const pinch = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const element = content();
      if (!element) return;
      if (!target) {
        target = committed.current;
        element.style.transformOrigin = `${container.scrollLeft + container.clientWidth / 2}px ${container.scrollTop + ANCHOR_Y}px`;
        element.style.willChange = 'transform';
      }
      target = clampZoom(target * Math.exp(-event.deltaY * PINCH_SENSITIVITY));
      element.style.transform = `scale(${target / committed.current})`;
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, SETTLE_MS);
    };
    container.addEventListener('wheel', pinch, { passive: false });
    return () => {
      container.removeEventListener('wheel', pinch);
      window.clearTimeout(timer);
      clearPreview();
    };
  }, [scroller, setZoom]);
}

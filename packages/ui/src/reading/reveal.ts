const MARGIN = 8;

/**
 * Scrolls only `scroller` vertically so `target` is visible. Unlike scrollIntoView it never
 * touches ancestors, which would otherwise shift overflow-hidden shells while panels slide in.
 */
export function revealIn(
  scroller: HTMLElement,
  target: Element,
  behavior: ScrollBehavior = 'auto',
) {
  const outer = scroller.getBoundingClientRect();
  const inner = target.getBoundingClientRect();
  const offset =
    inner.top < outer.top
      ? inner.top - outer.top - MARGIN
      : inner.bottom > outer.bottom
        ? inner.bottom - outer.bottom + MARGIN
        : 0;
  if (offset) scroller.scrollBy({ top: offset, behavior });
}

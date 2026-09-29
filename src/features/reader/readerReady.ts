/*
 * The reader draws asynchronously in several places (lazy code, PDF parsing, restoring the
 * saved page, rendering each page), so readiness is judged from what the user would see:
 * the reader counts as ready once its first screen is fully drawn, or once it needs the
 * user (a dialog) or has an error to show.
 */
const STABLE_FRAMES = 2;
const GIVE_UP = 10_000;

function intersects(a: DOMRect, b: DOMRect) {
  return a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right;
}

function firstScreenDrawn(stage: HTMLElement) {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  if (stage.querySelector('.empty-state, [role="alert"]')) return true;
  const markdown = stage.querySelector('.markdown-content');
  if (markdown) return markdown.children.length > 0 && !markdown.querySelector('.page-skeleton');
  const canvas = stage.querySelector('.reading-canvas');
  if (!canvas) return false;
  const view = canvas.getBoundingClientRect();
  const visible = [...canvas.querySelectorAll('.pdf-paper')].filter((page) =>
    intersects(page.getBoundingClientRect(), view),
  );
  return visible.length > 0 && visible.every((page) => page.getAttribute('aria-busy') === 'false');
}

/**
 * Calls `onReady` once the reader inside `stage` has drawn its first screen. The check must
 * hold for consecutive frames so a page drawn just before the saved position is restored
 * does not count. Returns a function that stops waiting.
 */
export function whenReaderReady(stage: HTMLElement, onReady: () => void) {
  const started = performance.now();
  let stable = 0;
  let frame = requestAnimationFrame(function check() {
    stable = firstScreenDrawn(stage) ? stable + 1 : 0;
    if (stable >= STABLE_FRAMES) return onReady();
    if (performance.now() - started > GIVE_UP) {
      console.error('Reader did not finish drawing its first screen; showing it anyway.');
      return onReady();
    }
    frame = requestAnimationFrame(check);
  });
  return () => cancelAnimationFrame(frame);
}

import type { Book, ReadingLocation, ReadingState } from '../types';
import { defaultLayout, parseLayout } from './layout';
export function initialReadingState(book: Book): ReadingState {
  const fallback: ReadingState = {
    page: book.page,
    ratio: 0,
    xRatio: 0,
    screenY: 24,
    zoom: 1,
    layout: defaultLayout,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(`folio-position:${book.id}`) || 'null');
    if (!saved || !Number.isFinite(saved.page)) return fallback;
    return {
      layout: parseLayout(saved.layout),
      page: Math.max(1, Math.min(book.pages, Math.floor(saved.page))),
      zoom: Math.max(0.5, Math.min(2, Number(saved.zoom) || 1)),
      ratio: Math.max(0, Math.min(1, Number(saved.ratio) || 0)),
      offset: Number.isInteger(saved.offset) && saved.offset >= 0 ? saved.offset : undefined,
      xRatio: Math.max(0, Math.min(1, Number(saved.xRatio) || 0)),
      screenY: Number.isFinite(saved.screenY) ? saved.screenY : 24,
    };
  } catch {
    return fallback;
  }
}
export function saveReadingState(id: string, state: ReadingState) {
  localStorage.setItem(`folio-position:${id}`, JSON.stringify(state));
}
export function captureLocation(container: HTMLElement, page: number): ReadingLocation | null {
  const section = container.querySelector<HTMLElement>(`.pdf-slot[data-page="${page}"]`);
  if (!section) return null;
  const box = container.getBoundingClientRect();
  const bounds = section.getBoundingClientRect();
  const result: ReadingLocation = {
    page,
    ratio: Math.max(0, (box.top - bounds.top) / bounds.height),
    xRatio: container.scrollLeft / Math.max(1, bounds.width),
    screenY: 24,
  };
  let nearest: { span: HTMLElement; rect: DOMRect; distance: number } | undefined;
  for (const span of section.querySelectorAll<HTMLElement>('[data-start]')) {
    for (const rect of span.getClientRects()) {
      if (rect.bottom <= box.top || rect.top >= box.bottom || rect.width < 1) continue;
      const distance = Math.abs(rect.top - box.top - 24);
      if (!nearest || distance < nearest.distance) nearest = { span, rect, distance };
    }
  }
  if (nearest) {
    const { span, rect } = nearest;
    const caret = document.caretRangeFromPoint(
      Math.max(box.left + 2, rect.left + 2),
      Math.min(box.bottom - 2, rect.top + rect.height / 2),
    );
    const prefix = document.createRange();
    prefix.selectNodeContents(span);
    if (caret && span.contains(caret.startContainer)) {
      prefix.setEnd(caret.startContainer, caret.startOffset);
      result.offset = Number(span.dataset.start) + prefix.toString().length;
    } else result.offset = Number(span.dataset.start);
    result.screenY = rect.top - box.top;
    if (span.firstChild?.nodeType === Node.TEXT_NODE && span.firstChild.textContent?.length) {
      const character = document.createRange();
      const index = Math.min(
        span.firstChild.textContent.length - 1,
        Math.max(0, result.offset! - Number(span.dataset.start)),
      );
      character.setStart(span.firstChild, index);
      character.setEnd(span.firstChild, index + 1);
      result.screenY = character.getBoundingClientRect().top - box.top;
    }
  }
  return result;
}
export function restoreLocation(container: HTMLElement, target: ReadingLocation): boolean {
  const section = container.querySelector<HTMLElement>(`.pdf-slot[data-page="${target.page}"]`);
  if (!section) return false;
  const box = container.getBoundingClientRect();
  const bounds = section.getBoundingClientRect();
  let top = bounds.top + bounds.height * target.ratio;
  if (target.offset !== undefined) {
    const span = [...section.querySelectorAll<HTMLElement>('[data-start]')].find(
      (el) =>
        Number(el.dataset.start) <= target.offset! &&
        Number(el.dataset.start) + (el.textContent?.length || 0) > target.offset!,
    );
    if (span?.firstChild?.nodeType === Node.TEXT_NODE) {
      const index = Math.min(
        span.firstChild.textContent!.length - 1,
        Math.max(0, target.offset - Number(span.dataset.start)),
      );
      const range = document.createRange();
      range.setStart(span.firstChild, index);
      range.setEnd(span.firstChild, index + 1);
      top = range.getBoundingClientRect().top - (target.screenY ?? 24);
    }
  } else if (target.ratio === 0) top -= 16;
  container.scrollTop += top - box.top;
  container.scrollLeft = (target.xRatio || 0) * bounds.width;
  return true;
}

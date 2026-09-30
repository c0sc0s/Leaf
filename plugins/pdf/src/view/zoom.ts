export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
const STEP = 0.1;

export function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

// Snap to the step grid so repeated presses never drift (e.g. 1.1000000001).
export function stepZoom(value: number, direction: 1 | -1) {
  return clampZoom(Math.round((value + direction * STEP) / STEP) * STEP);
}

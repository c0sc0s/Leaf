const { readFileSync, writeFileSync } = require('node:fs');

const DEFAULT_SIZE = { width: 1440, height: 960 };
/** How much of the window must overlap a display for its saved position to be kept. */
const MIN_VISIBLE = { width: 160, height: 80 };

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Reads the window placement saved when the app last closed.
 * @returns The saved state, or null when none exists or the file cannot be understood.
 */
function readWindowState(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const state = JSON.parse(text);
    if ([state.x, state.y, state.width, state.height].every(isNumber)) return state;
  } catch {
    // Fall through to the warning below; a bad file must not stop the app from opening.
  }
  console.warn(`Ignoring unreadable window state in ${file}; using the default size.`);
  return null;
}

/** Saves where the window is and how big it is, as it would be when restored. */
function writeWindowState(file, window) {
  const bounds = window.getNormalBounds();
  const state = { ...bounds, maximized: window.isMaximized(), fullScreen: window.isFullScreen() };
  writeFileSync(file, JSON.stringify(state));
}

/**
 * Chooses the bounds to open with: the saved ones while they still land on a connected
 * display (shrunk to fit it), otherwise the default size, which Electron centres.
 * @param saved The saved state, or null.
 * @param workAreas The usable area of every connected display.
 */
function placeWindow(saved, workAreas) {
  if (!saved) return { ...DEFAULT_SIZE };
  const area = workAreas.find(
    (display) =>
      Math.min(saved.x + saved.width, display.x + display.width) - Math.max(saved.x, display.x) >=
        MIN_VISIBLE.width &&
      Math.min(saved.y + saved.height, display.y + display.height) - Math.max(saved.y, display.y) >=
        MIN_VISIBLE.height,
  );
  if (!area) return { ...DEFAULT_SIZE };
  return {
    x: Math.round(saved.x),
    y: Math.round(saved.y),
    width: Math.round(Math.min(saved.width, area.width)),
    height: Math.round(Math.min(saved.height, area.height)),
  };
}

module.exports = { readWindowState, writeWindowState, placeWindow };

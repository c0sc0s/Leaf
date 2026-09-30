import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { placeWindow, readWindowState, writeWindowState } from '../electron/windowState.ts';

afterEach(() => vi.restoreAllMocks());

const laptop = { x: 0, y: 25, width: 1512, height: 920 };
const external = { x: 1512, y: 0, width: 2560, height: 1415 };
const saved = (bounds: object) => ({ x: 200, y: 120, width: 1200, height: 800, ...bounds });

function stateFile(contents?: string) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'leaf-window-')), 'window-state.json');
  if (contents !== undefined) writeFileSync(file, contents);
  return file;
}

describe('window placement', () => {
  it('opens at the default size when nothing was saved', () => {
    expect(placeWindow(null, [laptop])).toEqual({ width: 1440, height: 960 });
  });
  it('restores the saved position and size on a display that is still connected', () => {
    expect(placeWindow(saved({ x: 1800, y: 100 }), [laptop, external])).toEqual({
      x: 1800,
      y: 100,
      width: 1200,
      height: 800,
    });
  });
  it('falls back to the default when the saved display is gone', () => {
    expect(placeWindow(saved({ x: 1800, y: 100 }), [laptop])).toEqual({ width: 1440, height: 960 });
  });
  it('keeps a window that only partly overlaps a display', () => {
    expect(placeWindow(saved({ x: 1300 }), [laptop])).toMatchObject({ x: 1300 });
  });
  it('shrinks a saved window larger than the display it lands on', () => {
    expect(placeWindow(saved({ width: 2400, height: 1600 }), [laptop])).toMatchObject({
      width: 1512,
      height: 920,
    });
  });
});

describe('saved window state', () => {
  it('round-trips the restored bounds with the maximised and full-screen flags', () => {
    const file = stateFile();
    writeWindowState(file, {
      getNormalBounds: () => ({ x: 10, y: 20, width: 1100, height: 700 }),
      isMaximized: () => true,
      isFullScreen: () => false,
    });
    expect(readWindowState(file)).toEqual({
      x: 10,
      y: 20,
      width: 1100,
      height: 700,
      maximized: true,
      fullScreen: false,
    });
  });
  it('treats a missing file as nothing saved', () => {
    expect(readWindowState(stateFile())).toBeNull();
  });
  it('warns and ignores a corrupt or incomplete file instead of failing to open', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readWindowState(stateFile('{not json'))).toBeNull();
    expect(readWindowState(stateFile('{"x":1,"y":2}'))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

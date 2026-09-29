import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { defaultSettings, readSettings } from '../src/lib/appearance';

const { applyBackdrop } = createRequire(import.meta.url)('../electron/appearance.cjs');
afterEach(() => vi.unstubAllGlobals());

function stored(value: string) {
  vi.stubGlobal('localStorage', { getItem: () => value });
}

describe('saved glass preferences', () => {
  it('upgrades existing preferences while retaining the chosen reading theme', () => {
    stored('{"theme":"dark","readerTheme":"light","originalColors":true}');
    expect(readSettings()).toEqual({
      ...defaultSettings,
      theme: 'dark',
      readerTheme: 'light',
      originalColors: true,
    });
  });
  it('retains a disabled effect and zero transparency', () => {
    stored('{"frostedGlass":false,"glassTransparency":0}');
    expect(readSettings()).toMatchObject({ frostedGlass: false, glassTransparency: 0 });
  });
  it('recovers from malformed preferences and invalid control values', () => {
    stored('broken json');
    expect(readSettings()).toEqual(defaultSettings);
    stored('{"frostedGlass":"false","glassTransparency":"100"}');
    expect(readSettings()).toEqual(defaultSettings);
    stored('{"glassTransparency":999}');
    expect(readSettings().glassTransparency).toBe(100);
    stored('{"glassTransparency":-10}');
    expect(readSettings().glassTransparency).toBe(0);
  });
});

describe('native window backdrop', () => {
  const window = () => ({
    setVibrancy: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    setBackgroundColor: vi.fn(),
  });
  it('removes and restores macOS vibrancy with an opaque fallback', () => {
    const win = window();
    applyBackdrop(win, { platform: 'darwin', supported: true, enabled: false, dark: false });
    expect(win.setVibrancy).toHaveBeenLastCalledWith(null);
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#f7f8f5');
    applyBackdrop(win, { platform: 'darwin', supported: true, enabled: true, dark: false });
    expect(win.setVibrancy).toHaveBeenLastCalledWith('under-window');
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#00000000');
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });
  it('removes and restores Windows Acrylic with a dark fallback', () => {
    const win = window();
    applyBackdrop(win, { platform: 'win32', supported: true, enabled: false, dark: true });
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('none');
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#111111');
    applyBackdrop(win, { platform: 'win32', supported: true, enabled: true, dark: true });
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('acrylic');
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#00000000');
    expect(win.setVibrancy).not.toHaveBeenCalled();
  });
  it('keeps unsupported Windows versions opaque without calling the unavailable material API', () => {
    const win = window();
    applyBackdrop(win, { platform: 'win32', supported: false, enabled: true, dark: false });
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#f7f8f5');
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });
});

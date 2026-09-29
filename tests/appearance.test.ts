import { describe, expect, it, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { defaultSettings, glassOpacity, readSettings } from '../src/lib/appearance';

vi.mock('../src/lib/preferences', () => ({ readPreference: vi.fn() }));
import { readPreference } from '../src/lib/preferences';

const { applyBackdrop } = createRequire(import.meta.url)('../electron/appearance.cjs');
afterEach(() => vi.unstubAllGlobals());

function stored(value: string) {
  vi.mocked(readPreference).mockReturnValue(value);
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

describe('glass transparency', () => {
  const platforms = ['darwin', 'win32'] as const;
  it.each(platforms)('is opaque at 0%% and fully clear at 100%% on %s', (platform) => {
    for (const dark of [false, true]) {
      expect(glassOpacity(platform, 0, dark)).toEqual({ surface: 1, chrome: 1 });
      expect(glassOpacity(platform, 100, dark)).toEqual({ surface: 0, chrome: 0 });
    }
  });
  it.each(platforms)('grows clearer as transparency rises on %s', (platform) => {
    const low = glassOpacity(platform, 20, false);
    const high = glassOpacity(platform, 60, false);
    expect(high.surface).toBeLessThan(low.surface);
    expect(high.chrome).toBeLessThan(low.chrome);
  });
  it('shows the lighter macOS material more clearly than Acrylic at the same value', () => {
    const mac = glassOpacity('darwin', defaultSettings.glassTransparency, false);
    const windows = glassOpacity('win32', defaultSettings.glassTransparency, false);
    expect(mac.surface).toBeCloseTo(0.55, 2);
    expect(mac.chrome).toBeCloseTo(0.25, 2);
    expect(windows.surface).toBeCloseTo(0.87, 2);
    expect(windows.chrome).toBeCloseTo(0.77, 2);
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
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#ffffff');
    applyBackdrop(win, { platform: 'darwin', supported: true, enabled: true, dark: false });
    expect(win.setVibrancy).toHaveBeenLastCalledWith('under-window');
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#00000000');
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });
  it('removes and restores Windows Acrylic with a dark fallback', () => {
    const win = window();
    applyBackdrop(win, { platform: 'win32', supported: true, enabled: false, dark: true });
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('none');
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#0a0a0a');
    applyBackdrop(win, { platform: 'win32', supported: true, enabled: true, dark: true });
    expect(win.setBackgroundMaterial).toHaveBeenLastCalledWith('acrylic');
    expect(win.setBackgroundColor).toHaveBeenLastCalledWith('#00000000');
    expect(win.setVibrancy).not.toHaveBeenCalled();
  });
  it('keeps unsupported Windows versions opaque without calling the unavailable material API', () => {
    const win = window();
    applyBackdrop(win, { platform: 'win32', supported: false, enabled: true, dark: false });
    expect(win.setBackgroundColor).toHaveBeenCalledWith('#ffffff');
    expect(win.setBackgroundMaterial).not.toHaveBeenCalled();
  });
});

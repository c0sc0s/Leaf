import { describe, expect, it, vi } from 'vitest';
import { applyBackdrop } from '../../../../electron/platform/appearance.ts';
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

import { describe, expect, it } from 'vitest';
import { glassOpacity } from '../../../src/platform/appearance';
import { defaultSettings } from '../../../src/core/settings/service';
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

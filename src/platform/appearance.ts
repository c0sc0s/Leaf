import type { Settings } from '@leaf/contracts/host';
export type GlassPlatform = 'darwin' | 'win32';
export interface GlassLayers {
  surface: number;
  chrome: number;
}

/**
 * Each layer's tint opacity is (1 - transparency) ^ falloff, so 0% is always opaque and
 * 100% always clear. macOS vibrancy is a far lighter material than Acrylic, so its tint
 * must fade faster before the blur shows; both are calibrated to look right at the default.
 */
const glassFalloff: Record<GlassPlatform, { light: GlassLayers; dark: GlassLayers }> = {
  darwin: { light: { surface: 4.3, chrome: 10 }, dark: { surface: 2.6, chrome: 10 } },
  win32: { light: { surface: 1, chrome: 1.9 }, dark: { surface: 1, chrome: 1.3 } },
};

export function glassOpacity(
  platform: GlassPlatform,
  transparency: number,
  dark: boolean,
): GlassLayers {
  const falloff = glassFalloff[platform][dark ? 'dark' : 'light'];
  const tint = 1 - transparency / 100;
  return { surface: tint ** falloff.surface, chrome: tint ** falloff.chrome };
}

function glassPlatform(platform: string): GlassPlatform {
  if (platform === 'darwin' || platform === 'win32') return platform;
  throw new Error(`Translucent window reported on unsupported platform: ${platform}`);
}

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

export function applyGlassAppearance(settings: Settings) {
  const root = document.documentElement;
  const desktop = window.desktop;
  const vibrant = desktop?.translucent === true && settings.frostedGlass;
  root.classList.toggle('vibrant', vibrant);
  if (!vibrant) return;
  const platform = glassPlatform(desktop.platform);
  for (const theme of ['light', 'dark'] as const) {
    const opacity = glassOpacity(platform, settings.glassTransparency, theme === 'dark');
    root.style.setProperty(`--glass-surface-${theme}`, percent(opacity.surface));
    root.style.setProperty(`--glass-chrome-${theme}`, percent(opacity.chrome));
  }
}

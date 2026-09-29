import type { Settings } from '../types';

export const defaultSettings: Settings = {
  theme: 'light',
  readerTheme: 'follow',
  frostedGlass: true,
  glassTransparency: 13,
  originalColors: false,
};

const themes = new Set<Settings['theme']>(['light', 'dark', 'system']);
const readerThemes = new Set<Settings['readerTheme']>(['follow', 'light', 'dark']);

/** Validate each preference independently when reading older settings. */
export function parseSettings(raw: string | null): Settings {
  let saved: Partial<Settings> = {};
  try {
    const value = JSON.parse(raw || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch {
    if (typeof localStorage !== 'undefined') localStorage.removeItem?.('folio-settings');
  }
  return {
    theme: themes.has(saved.theme!) ? saved.theme! : defaultSettings.theme,
    readerTheme: readerThemes.has(saved.readerTheme!)
      ? saved.readerTheme!
      : defaultSettings.readerTheme,
    originalColors: saved.originalColors === true,
    frostedGlass:
      typeof saved.frostedGlass === 'boolean' ? saved.frostedGlass : defaultSettings.frostedGlass,
    glassTransparency:
      typeof saved.glassTransparency === 'number' && Number.isFinite(saved.glassTransparency)
        ? Math.round(Math.min(100, Math.max(0, saved.glassTransparency)))
        : defaultSettings.glassTransparency,
  };
}

export function readSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem('folio-settings'));
  } catch {
    return { ...defaultSettings };
  }
}

export function applyGlassAppearance(settings: Settings) {
  const root = document.documentElement;
  root.classList.toggle('vibrant', window.desktop?.translucent === true && settings.frostedGlass);
  root.style.setProperty('--glass-transparency', `${settings.glassTransparency}%`);
}

import type { Settings } from '../types';

export const defaultSettings: Settings = {
  theme: 'light',
  readerTheme: 'follow',
  frostedGlass: true,
  glassTransparency: 13,
};

export function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem('folio-settings') || '{}');
    return {
      ...defaultSettings,
      ...saved,
      frostedGlass:
        typeof saved.frostedGlass === 'boolean' ? saved.frostedGlass : defaultSettings.frostedGlass,
      glassTransparency:
        typeof saved.glassTransparency === 'number' && Number.isFinite(saved.glassTransparency)
          ? Math.round(Math.min(100, Math.max(0, saved.glassTransparency)))
          : defaultSettings.glassTransparency,
    };
  } catch {
    return { ...defaultSettings };
  }
}

export function applyGlassAppearance(settings: Settings) {
  const root = document.documentElement;
  root.classList.toggle('vibrant', window.desktop?.translucent === true && settings.frostedGlass);
  root.style.setProperty('--glass-transparency', `${settings.glassTransparency}%`);
}

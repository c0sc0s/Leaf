import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../types';

const SETTINGS_KEY = 'folio-settings';
const defaultSettings: Settings = { theme: 'light', readerTheme: 'follow' };
const themes = new Set<Settings['theme']>(['light', 'dark', 'system']);
const readerThemes = new Set<Settings['readerTheme']>(['follow', 'light', 'dark']);

/** Validates stored preferences field by field; anything unreadable falls back to its default. */
export function parseSettings(raw: string | null): Settings {
  let stored: Partial<Settings> = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    localStorage.removeItem(SETTINGS_KEY);
  }
  return {
    theme: themes.has(stored.theme!) ? stored.theme! : defaultSettings.theme,
    readerTheme: readerThemes.has(stored.readerTheme!)
      ? stored.readerTheme!
      : defaultSettings.readerTheme,
    originalColors: stored.originalColors === true,
  };
}

function useSystemDark() {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = (event: MediaQueryListEvent) => setDark(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return dark;
}

/** Owns user preferences: persistence, the resolved theme, and applying it to the document. */
export function useSettings() {
  const [settings, setSettings] = useState(() => parseSettings(localStorage.getItem(SETTINGS_KEY)));
  const systemDark = useSystemDark();
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
    window.desktop?.setTheme(settings.theme);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, dark]);
  const toggleTheme = useCallback(
    () => setSettings((current) => ({ ...current, theme: dark ? 'light' : 'dark' })),
    [dark],
  );
  return { settings, setSettings, dark, toggleTheme };
}

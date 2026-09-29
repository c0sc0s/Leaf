import { rememberPreference } from '../../lib/preferences';
import { useCallback, useEffect, useState } from 'react';
import { applyGlassAppearance, readSettings } from '../../lib/appearance';
export { parseSettings } from '../../lib/appearance';

export function useSettings() {
  const [settings, setSettings] = useState(readSettings);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', dark);
    window.desktop?.setTheme(settings.theme);
  }, [settings.theme, dark]);
  useEffect(() => {
    rememberPreference('folio-settings', JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    applyGlassAppearance(settings);
  }, [settings.frostedGlass, settings.glassTransparency]);
  useEffect(() => {
    window.desktop?.setFrostedGlass?.(settings.frostedGlass);
  }, [settings.frostedGlass]);
  const toggleTheme = useCallback(
    () => setSettings((current) => ({ ...current, theme: dark ? 'light' : 'dark' })),
    [dark],
  );
  return { settings, setSettings, dark, toggleTheme };
}

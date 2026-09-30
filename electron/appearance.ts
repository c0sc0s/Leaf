import type { BrowserWindow } from 'electron';

export interface Backdrop {
  platform: NodeJS.Platform;
  supported: boolean;
  enabled: boolean;
  dark: boolean;
}

type BackdropWindow = Pick<
  BrowserWindow,
  'setVibrancy' | 'setBackgroundMaterial' | 'setBackgroundColor'
>;

export function applyBackdrop(
  window: BackdropWindow,
  { platform, supported, enabled, dark }: Backdrop,
) {
  const active = supported && enabled;
  if (platform === 'darwin') window.setVibrancy(active ? 'under-window' : null);
  else if (platform === 'win32' && supported)
    window.setBackgroundMaterial(active ? 'acrylic' : 'none');
  window.setBackgroundColor(active ? '#00000000' : dark ? '#0a0a0a' : '#ffffff');
}

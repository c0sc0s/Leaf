const mac = window.desktop?.platform === 'darwin' || /Mac/.test(navigator.platform);

export function shortcutLabel(key: string) {
  return mac ? `⌘${key}` : `Ctrl+${key}`;
}

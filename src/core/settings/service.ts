import type { Settings } from '@leaf/contracts/host';
import type { JsonValue } from '@leaf/shared/types';
import { Store } from '@leaf/shared/events';
import { SerialQueue } from '@leaf/shared/async';
import type { StorageTransport } from '@leaf/contracts/transport';

export const defaultSettings: Settings = {
  theme: 'light',
  readerTheme: 'follow',
  originalColors: false,
  frostedGlass: true,
  glassTransparency: 13,
};
export function parseSettings(raw: JsonValue | undefined): Settings {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    theme: ['light', 'dark', 'system'].includes(String(value.theme))
      ? (value.theme as Settings['theme'])
      : defaultSettings.theme,
    readerTheme: ['follow', 'light', 'dark'].includes(String(value.readerTheme))
      ? (value.readerTheme as Settings['readerTheme'])
      : defaultSettings.readerTheme,
    originalColors: value.originalColors === true,
    frostedGlass:
      typeof value.frostedGlass === 'boolean' ? value.frostedGlass : defaultSettings.frostedGlass,
    glassTransparency:
      typeof value.glassTransparency === 'number' && Number.isFinite(value.glassTransparency)
        ? Math.max(0, Math.min(100, Math.round(value.glassTransparency)))
        : defaultSettings.glassTransparency,
  };
}
export class SettingsService {
  readonly state = new Store<Settings>({ ...defaultSettings });
  readonly values = new Store<Record<string, JsonValue>>({});
  private queue = new SerialQueue();
  constructor(private storage: StorageTransport) {}
  async initialize() {
    const values = await this.storage.request('settings.list', undefined);
    this.values.set(values);
    this.state.set(parseSettings(values.appearance));
  }
  preference(key: string, value: JsonValue) {
    return this.queue.enqueue(async () => {
      await this.storage.request('settings.set', { key, value });
      this.values.update((values) => ({ ...values, [key]: value }));
    });
  }
  update(settings: Settings) {
    const value = parseSettings(settings as unknown as JsonValue);
    this.state.set(value);
    return this.queue.enqueue(async () => {
      await this.storage.request('settings.set', {
        key: 'appearance',
        value: value as unknown as JsonValue,
      });
    });
  }
}

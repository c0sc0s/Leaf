export interface UIPreferences {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
let preferences: UIPreferences = { get: () => null, set: () => {} };
export function configureUIPreferences(value: UIPreferences) {
  preferences = value;
}
export function readUIValue(key: string) {
  return preferences.get(key);
}
export function saveUIValue(key: string, value: string) {
  preferences.set(key, value);
}

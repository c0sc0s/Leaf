import { registerStorageFlusher, storageRequest } from './storageClient';
let values: Record<string, string> = {};
const dirty = new Map<string, string | null>();
registerStorageFlusher(async () => {
  for (const [key, value] of dirty) await writePreference(key, value);
});
export async function loadPreferences() {
  values = await storageRequest<Record<string, string>>('preferences');
}
export const readPreference = (key: string) => values[key] ?? null;
export function writePreference(key: string, value: string | null) {
  if (value === null) delete values[key];
  else values[key] = value;
  dirty.set(key, value);
  return storageRequest('setPreference', { key, value }).then(() => {
    if (dirty.get(key) === value) dirty.delete(key);
  });
}
export function rememberPreference(key: string, value: string) {
  void writePreference(key, value).catch(() => {});
}
export function forgetPreference(key: string) {
  delete values[key];
  dirty.delete(key);
}

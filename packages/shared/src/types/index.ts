export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 32) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return value.length <= 200_000 && value.every((entry) => isJsonValue(entry, depth + 1));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value).every(
    ([key, entry]) => key !== '__proto__' && key !== 'constructor' && isJsonValue(entry, depth + 1),
  );
}

export function jsonObject(value: unknown): JsonObject {
  if (!isJsonValue(value) || value === null || Array.isArray(value) || typeof value !== 'object')
    throw new Error('Expected a JSON object');
  return value;
}

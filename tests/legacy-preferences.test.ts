import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/lib/storageClient', () => ({ storageRequest: request }));
vi.mock('../src/lib/db', () => ({
  fingerprint: async () => 'digest',
  stageBook: vi.fn(),
  releaseUploads: vi.fn(),
}));
import { migrateLegacyStorage } from '../src/lib/legacyMigration';
let local: Record<string, string>;
beforeEach(() => {
  request.mockReset();
  local = {};
  vi.stubGlobal('indexedDB', { databases: async () => [] });
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:5173' });
  const storage = Object.create({
    getItem: (key: string) => local[key] ?? null,
    removeItem: (key: string) => {
      delete local[key];
      delete storage[key];
    },
  });
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());
function seed(values: Record<string, string>) {
  Object.assign(local, values);
  Object.assign(localStorage, values);
}
it('migrates panel widths after a previously committed library migration without changing its receipt', async () => {
  seed({ 'folio-initialized': '1', 'leaf-sidebar-width': '380', 'leaf-notes-width': '410' });
  request.mockImplementation(async (operation: string) =>
    operation === 'legacyReceipt'
      ? 'existing-receipt'
      : operation === 'preferences'
        ? { 'folio-initialized': '1' }
        : undefined,
  );
  await migrateLegacyStorage();
  expect(request).toHaveBeenCalledWith('setPreference', {
    key: 'leaf-sidebar-width',
    value: '380',
  });
  expect(request).toHaveBeenCalledWith('setPreference', { key: 'leaf-notes-width', value: '410' });
  expect(request.mock.calls.some(([operation]) => operation === 'importLegacy')).toBe(false);
  expect(local).toEqual({});
});
it('keeps the newer SQLite width when old localStorage values remain', async () => {
  seed({ 'leaf-sidebar-width': '380' });
  request.mockResolvedValue({ 'leaf-sidebar-width': '420' });
  await migrateLegacyStorage();
  expect(request).toHaveBeenCalledTimes(1);
  expect(local).toEqual({});
});
it('retains the legacy value when saving it fails', async () => {
  seed({ 'leaf-sidebar-width': '380' });
  request.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('disk full'));
  await expect(migrateLegacyStorage()).rejects.toThrow('disk full');
  expect(local).toEqual({ 'leaf-sidebar-width': '380' });
});

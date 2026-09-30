import { expect, type Page } from '@playwright/test';
export async function emptyLibrary(page: Page) {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.evaluate(async () => {
    const { StorageClient } = await import('/src/platform/transport/storage.ts');
    const storage = new StorageClient();
    await storage.request('settings.set', { key: 'tests.samples', value: true });
    for (const document of await storage.request('library.list', undefined))
      await storage.request('library.delete', document.id);
  });
  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(0);
}

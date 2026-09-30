import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('desktop persists resized reader panels without storage errors', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-panels-'));
  const launch = () =>
    electron.launch({
      args: ['.', '--dev'],
      env: { ...process.env, LEAF_USER_DATA: root },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.locator('.book-card')).toHaveCount(8);
    await page.evaluate(() => {
      (window as unknown as { storageErrors: unknown[] }).storageErrors = [];
      window.addEventListener('leaf:storage-error', (event) =>
        (window as unknown as { storageErrors: unknown[] }).storageErrors.push(
          String((event as CustomEvent).detail),
        ),
      );
    });
    await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
    await page.getByLabel('文档导航', { exact: true }).click();
    const sidebar = page.locator('.reader-sidebar [role="separator"]');
    await expect(sidebar).toBeVisible();
    const initial = Number(await sidebar.getAttribute('aria-valuenow'));
    await sidebar.press('ArrowRight');
    await expect(sidebar).toHaveAttribute('aria-valuenow', String(initial + 16));
    await page.getByLabel('阅读笔记', { exact: true }).click();
    const notes = page.locator('.notes-panel [role="separator"]');
    await expect(notes).toBeVisible();
    const notesInitial = Number(await notes.getAttribute('aria-valuenow'));
    const handle = await notes.boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2 - 40, handle!.y + handle!.height / 2, {
      steps: 4,
    });
    await page.mouse.up();
    await expect(notes).toHaveAttribute('aria-valuenow', String(notesInitial + 40));
    await page.evaluate(async () => {
      const { flushStorage } = await import('/src/lib/storageClient.ts');
      await flushStorage();
    });
    expect(
      await page.evaluate(() => (window as unknown as { storageErrors: unknown[] }).storageErrors),
    ).toEqual([]);
    expect(await page.evaluate(() => window.desktop!.storage.request('preferences'))).toMatchObject(
      { 'leaf-sidebar-width': String(initial + 16), 'leaf-notes-width': String(notesInitial + 40) },
    );
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('.book-card')).toHaveCount(8);
    await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
    await page.getByLabel('文档导航', { exact: true }).click();
    await expect(page.locator('.reader-sidebar [role="separator"]')).toHaveAttribute(
      'aria-valuenow',
      String(initial + 16),
    );
    await page.getByLabel('阅读笔记', { exact: true }).click();
    await expect(page.locator('.notes-panel [role="separator"]')).toHaveAttribute(
      'aria-valuenow',
      String(notesInitial + 40),
    );
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

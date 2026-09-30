import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('desktop imports Markdown files and folders through native dialogs', async () => {
  // Windows CI runs this full import flow close to the default limit, including cleanup.
  test.setTimeout(120_000);
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-md-desktop-'));
  const folder = path.join(root, 'Desktop Book');
  await mkdir(folder);
  await writeFile(path.join(root, 'single.md'), '# Desktop Single\n\nDesktop reading.');
  await writeFile(path.join(folder, 'README.md'), '# Native folder\n\n[Next](2.md)');
  await writeFile(path.join(folder, '2.md'), '# Native chapter two');
  const app = await electron.launch({
    args: ['.', '--dev'],
    env: { ...process.env, LEAF_USER_DATA: path.join(root, 'profile') },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.locator('.book-card')).toHaveCount(8);
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      },
      path.join(root, 'single.md'),
    );
    await page.getByRole('button', { name: '导入文件', exact: true }).click();
    await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
    await expect(page.locator('.book-card')).toHaveCount(9);
    await page.getByRole('button', { name: '阅读 Desktop Single', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Desktop Single');
    await page.getByLabel('返回书架', { exact: true }).click();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, folder);
    await page.getByRole('button', { name: '导入文件', exact: true }).click();
    await page.getByRole('menuitem', { name: '导入文件夹', exact: true }).click();
    await expect(page.locator('.book-card')).toHaveCount(10);
    await page.getByRole('button', { name: '阅读 Desktop Book', exact: true }).click();
    await expect(page.locator('.outline-item.depth-0')).toHaveCount(2);
    await expect(page.locator('.markdown-status')).toContainText('第 1 / 2 章');
    await page.getByRole('link', { name: 'Next', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Native chapter two');
    await page.getByLabel('返回书架', { exact: true }).click();
    // OS file-open events can arrive together, even while an import is pending.
    // A damaged PDF must not drop the Markdown books queued behind it.
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      for (const [name, text] of [
        ['broken.pdf', 'damaged PDF'],
        ['queued-one.md', '# Queued One\n\nFirst queued import.'],
        ['queued-two.md', '# Queued Two\n\nSecond queued import.'],
      ])
        window.webContents.send('pdf:open', { name, data: new Uint8Array(Buffer.from(text)) });
    });
    await expect(page.locator('.book-card')).toHaveCount(12);
    await page.getByRole('button', { name: '阅读 Queued One', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Queued One');
    await page.getByLabel('返回书架', { exact: true }).click();
    await page.getByRole('button', { name: '阅读 Queued Two', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Queued Two');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

import { test, expect } from '@playwright/test';
import { plainPackage } from '../fixtures/plugin';
test('contains a plugin view failure and preserves the library while recovering after reload', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '安装插件包', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: 'plain.leaf-plugin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(plainPackage({ fault: true })),
  });
  await expect(page.locator('[data-plugin-id="test.plain"]')).toContainText('已启用');
  await page.keyboard.press('Escape');
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'recovery.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Saved original content.'),
  });
  await page.getByRole('button', { name: '阅读 recovery.txt', exact: true }).click();
  await expect(page.locator('.reader-error')).toContainText('Plugin view failed');
  await page
    .locator('.reader-error')
    .getByRole('button', { name: '返回书架', exact: true })
    .click();
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.addInitScript(() => Object.assign(globalThis, { leafRecovered: true }));
  await page.reload();
  await page.getByRole('button', { name: '阅读 recovery.txt', exact: true }).click();
  await expect(page.locator('[data-plain-content]')).toHaveText('Saved original content.');
  await expect(page.locator('.reader-error')).toHaveCount(0);
});

import { test, expect, type Page } from '@playwright/test';
import { plainPackage } from '../fixtures/plugin';
async function preferences(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
}
async function remove(page: Page, id: string) {
  await page
    .locator(`[data-plugin-id="${id}"]`)
    .getByRole('button', { name: '卸载', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.book-card')).toHaveCount(8);
}
async function install(page: Page) {
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '安装插件包', exact: true }).click();
  await (
    await chosen
  ).setFiles({
    name: 'plain.leaf-plugin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(plainPackage()),
  });
  await expect(page.locator('[data-plugin-id="test.plain"]')).toContainText('已启用');
}
test('installs a third reader through the protocol, retains the last reader and restores plugin data after reinstall', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await preferences(page);
  await remove(page, 'leaf.ai');
  await preferences(page);
  await remove(page, 'leaf.markdown');
  await preferences(page);
  await page
    .locator('[data-plugin-id="leaf.pdf"]')
    .getByRole('button', { name: '卸载', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('至少需要保留');
  await install(page);
  await remove(page, 'leaf.pdf');
  await expect(page.getByLabel('选择阅读文件', { exact: true })).toHaveAttribute('accept', '.txt');
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'protocol.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('A document supplied by a separately installed plugin.'),
  });
  await page.getByRole('button', { name: '阅读 protocol.txt', exact: true }).click();
  await expect(page.locator('[data-plain-content]')).toContainText('separately installed plugin');
  await expect(page.getByLabel('AI 问答', { exact: true })).toHaveCount(0);
  await page.getByLabel('记录阅读次数', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阅读次数 1');
  await page.getByLabel('返回书架', { exact: true }).click();
  await preferences(page);
  const chosen = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '安装插件包', exact: true }).click();
  await (await chosen).setFiles('dist-plugins/leaf.pdf.leaf-plugin');
  await expect(page.locator('[data-plugin-id="leaf.pdf"]')).toContainText('已启用');
  await page
    .locator('[data-plugin-id="test.plain"]')
    .getByRole('button', { name: '卸载', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.book-card')).toHaveCount(9);
  await preferences(page);
  await install(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '阅读 protocol.txt', exact: true }).click();
  await page.getByLabel('记录阅读次数', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阅读次数 2');
});

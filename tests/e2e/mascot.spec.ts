import { test, expect } from '@playwright/test';
import { emptyLibrary } from './emptyLibrary';

async function expectArt(page: import('@playwright/test').Page, scene: string) {
  const art = page.locator(`img[src$="/mascot/${scene}.png"]`);
  await expect(art).toBeVisible();
  await expect
    .poll(() => art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
}

test('uses distinct favorites, search and recent states with useful actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByRole('navigation').getByRole('button', { name: '收藏' }).click();
  await expectArt(page, 'empty');
  await page.getByRole('button', { name: '浏览书架', exact: true }).click();
  await page.getByLabel('搜索书库', { exact: true }).fill('no-such-book-xyz');
  await expectArt(page, 'empty');
  await page
    .locator('[data-empty-scene="search"]')
    .getByRole('button', { name: '清空搜索' })
    .click();
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page
    .getByRole('button', { name: /^阅读 / })
    .first()
    .click();
  await expect(page.locator('.pdf-paper').first()).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('返回书架', { exact: true }).click();
  await expect(page.locator('.continue-reading')).toBeVisible();
});

test('shows the real empty library state and recovers from unknown routes', async ({ page }) => {
  await emptyLibrary(page);
  await expectArt(page, 'empty');
  await page.evaluate(() => {
    location.hash = '/missing-page';
  });
  await expectArt(page, 'not-found');
  await page.getByRole('button', { name: '返回上一个位置' }).click();
  await expect(page.locator('.leaf-not-found')).toHaveCount(0);
  await page.goto('/#/another-missing-page');
  await page.getByRole('button', { name: '返回书架', exact: true }).click();
  await expectArt(page, 'empty');
});

test('renders small sidebar illustrations and settings in both themes without moving the PDF', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await expect(page.locator('.pdf-paper').first()).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('文档导航', { exact: true }).click();
  await page.getByRole('tab', { name: '文档书签' }).click();
  await expectArt(page, 'empty');
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await expectArt(page, 'reading');
  const position = await page.locator('.reading-canvas').evaluate((el) => el.scrollTop);
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读偏好' }).click();
  await expectArt(page, 'settings');
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const settingsArt = page.locator('.leaf-settings-intro img[src$="/settings.png"]');
  await expect(settingsArt).toBeVisible();
  await expect(settingsArt).toHaveCSS('image-rendering', 'auto');
  await expect(settingsArt).toHaveCSS('filter', 'invert(1)');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect
    .poll(() => page.locator('.reading-canvas').evaluate((el) => el.scrollTop))
    .toBe(position);
  await page.getByLabel('搜索文档', { exact: true }).click();
  await page.getByLabel('搜索文档内容').fill('no-such-phrase-xyz');
  await expect(page.locator('[data-empty-scene="search"]')).toBeVisible();
  await page
    .locator('[data-empty-scene="search"]')
    .getByRole('button', { name: '清空搜索' })
    .click();
  await expect(page.getByLabel('搜索文档内容')).toBeFocused();
  await expect(page.locator('[data-empty-scene="search"]')).toHaveCount(0);
});

import { test, expect } from '@playwright/test';

test('supports keyboard menus, category changes, and dialog focus restoration', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await expect(page.getByRole('navigation', { name: '书库导航' })).toHaveCount(1);
  const manage = page.getByRole('button', { name: '管理 The Art of Noticing', exact: true });
  await manage.focus();
  await manage.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(manage).toBeFocused();
  await manage.press('Enter');
  await page.getByRole('menuitemradio', { name: '技术与思考', exact: true }).click();
  await page.locator('.collections').getByRole('button', { name: '技术与思考' }).click();
  await expect(
    page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.locator('.collections').getByRole('button', { name: '技术与思考' }).click();
  await expect(
    page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }),
  ).toBeVisible();
  const settings = page.getByRole('button', { name: '设置', exact: true });
  await settings.click();
  const dialog = page.getByRole('dialog', { name: '阅读偏好' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByLabel('正文宽度')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});

test('keeps controls readable in both themes and at the minimum desktop size', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('切换深色模式', { exact: true }).click();
  await expect(page.locator('.book-title').first()).toHaveCSS('color', 'rgb(238, 238, 239)');
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(page.getByRole('button', { name: '导入 PDF', exact: true })).toBeInViewport();
  await expect(page.getByLabel('搜索书库', { exact: true })).toBeInViewport();
  expect(
    await page.locator('.library-main').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByLabel('列表视图', { exact: true }).click();
  await expect(page.locator('.book-list .book-card')).toHaveCount(8);
  await page.getByLabel('切换浅色模式', { exact: true }).click();
  await expect(page.locator('.book-title').first()).toHaveCSS('color', 'rgb(32, 32, 36)');
});

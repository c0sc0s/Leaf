import { test, expect } from '@playwright/test';

test('supports keyboard menus and dialog focus restoration', async ({ page }) => {
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
  const settings = page.getByRole('button', { name: '设置', exact: true });
  await settings.click();
  const dialog = page.getByRole('dialog', { name: '阅读偏好' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
});

test('keeps controls readable in both themes and at the minimum desktop size', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('切换深色模式', { exact: true }).click();
  await expect(page.locator('.book-title').first()).toHaveCSS('color', 'oklch(0.985 0 0)');
  await page.setViewportSize({ width: 900, height: 640 });
  await expect(page.getByRole('button', { name: '导入文件', exact: true })).toBeInViewport();
  await expect(page.getByLabel('搜索书库', { exact: true })).toBeInViewport();
  expect(
    await page.locator('.library-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByLabel('列表视图', { exact: true }).click();
  await expect(page.locator('.book-list .book-card')).toHaveCount(8);
  await page.getByLabel('切换浅色模式', { exact: true }).click();
  await expect(page.locator('.book-title').first()).toHaveCSS('color', 'oklch(0.145 0 0)');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '阅读偏好' });
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport();
  await expect(dialog.getByText('偏好自动保存在本机')).toBeInViewport();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const colors = dialog.getByLabel('原版颜色', { exact: true });
  await colors.scrollIntoViewIfNeeded();
  await expect(colors).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport();
  await expect(dialog.getByText('偏好自动保存在本机')).toBeInViewport();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

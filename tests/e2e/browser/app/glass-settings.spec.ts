import { test, expect } from '@playwright/test';
test('explains unavailable native glass controls in the browser', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '毛玻璃背景' })).toBeDisabled();
  await expect(page.getByRole('slider', { name: '背景透明度' })).toBeDisabled();
  await expect(page.locator('html')).not.toHaveClass(/vibrant/);
});

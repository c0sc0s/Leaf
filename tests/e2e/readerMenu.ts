import type { Page } from '@playwright/test';

export async function openReaderSettings(page: Page) {
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读偏好', exact: true }).click();
}

export async function switchReaderToDark(page: Page) {
  await openReaderSettings(page);
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
}

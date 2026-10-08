import { test, expect } from '@playwright/test';

const release = {
  version: '1.6.0',
  notes: '<script>throw new Error("unsafe")</script>\n改进阅读体验',
  url: 'https://github.com/c0sc0s/Leaf/releases/tag/v1.6.0',
};

test('update panel handles progress, save failures and retry without exposing release HTML', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tests/fixtures/update-panel.html');
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.locator('.update-panel')).toContainText('正在检查更新');
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled();
  await page.evaluate(
    (release) => window.updateFixture.publish({ status: 'available', release }),
    release,
  );
  await expect(page.locator('.update-notice')).toContainText('Leaf 1.6.0 可更新');
  await page.getByText('更新说明', { exact: true }).click();
  await expect(page.locator('.update-notes')).toContainText('<script>');
  await expect(page.locator('.update-notes script')).toHaveCount(0);
  await page.getByRole('button', { name: '下载更新', exact: true }).click();
  await page.evaluate(() => window.updateFixture.publish({ progress: 57 }));
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '57');
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toBeDisabled();
  await page.evaluate(() => window.updateFixture.publish({ status: 'downloaded', progress: 100 }));
  await expect(page.locator('.update-notice')).toContainText('更新已下载');
  await page.evaluate(() => window.updateFixture.failSave(true));
  await page.getByRole('button', { name: '重启并更新', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('笔记未保存');
  await expect(page.getByRole('button', { name: '重启并更新', exact: true })).toBeEnabled();
  await page.evaluate(() => window.updateFixture.failSave(false));
  await page.getByRole('button', { name: '重启并更新', exact: true }).click();
  await expect(page.locator('.update-panel')).toContainText('正在保存并准备重启');
  expect(await page.evaluate(() => window.updateFixture.calls)).toEqual([
    'check',
    'download',
    'install',
    'install',
  ]);
  expect(errors).toEqual([]);
});

test('manual update mode opens the release page and browser app disables desktop updates', async ({
  page,
}) => {
  await page.goto('/tests/fixtures/update-panel.html');
  await page.evaluate(
    (release) =>
      window.updateFixture.publish({
        status: 'available',
        installMode: 'manual',
        reason: '请从发布页面下载安装新版本',
        release,
      }),
    release,
  );
  await expect(page.getByRole('button', { name: '下载更新', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '下载新版本', exact: true }).click();
  expect(await page.evaluate(() => window.updateFixture.calls)).toEqual(['open']);
  await page.goto('/');
  await page.getByRole('button', { name: '关于 Leaf', exact: true }).click();
  await expect(page.locator('.update-panel')).toContainText('请在桌面应用中检查更新');
  await expect(page.getByRole('button', { name: '检查更新', exact: true })).toHaveCount(0);
});

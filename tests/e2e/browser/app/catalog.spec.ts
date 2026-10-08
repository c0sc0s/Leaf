import { test, expect, type Page } from '@playwright/test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { plainPackage, plainManifest } from '../../../fixtures/plugin';
import { hashBytes } from '../../../../electron/plugins/package';
import type { CatalogSnapshot } from '@leaf/contracts/catalog';
function fixture(version = '1.0.0') {
  const archive = JSON.parse(gunzipSync(plainPackage()).toString());
  archive.manifest.version = version;
  const data = gzipSync(JSON.stringify(archive));
  const snapshot: CatalogSnapshot = {
    catalog: {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      plugins: [
        {
          manifest: { ...plainManifest, version },
          author: 'Leaf',
          details: 'Read plain text with saved notes.',
          platforms: ['darwin', 'win32', 'linux'],
          download: {
            url: 'https://example.com/plain.leaf-plugin',
            size: data.byteLength,
            sha256: hashBytes(data),
          },
        },
      ],
    },
    fetchedAt: Date.now(),
    offline: false,
    platform: 'darwin',
  };
  return { data, snapshot };
}
async function discover(page: Page) {
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '发现插件', exact: true }).click();
}
async function confirm(page: Page) {
  await page.getByRole('button', { name: '查看 Plain text 详情', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Plain text', exact: true });
  await expect(detail).toContainText('保存插件设置和文档数据');
  await detail.getByRole('button', { name: '确认安装', exact: true }).click();
}
test('discovers, filters, installs and updates a plugin while preserving its private data', async ({
  page,
}) => {
  let current = fixture();
  await page.route('**/__leaf_catalog', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        input.operation === 'list'
          ? JSON.stringify({ result: current.snapshot })
          : JSON.stringify({ type: 'done', data: current.data.toString('base64') }) + '\n',
    });
  });
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await discover(page);
  await expect(page.locator('[data-catalog-id="test.plain"]')).toBeVisible();
  await page.getByLabel('搜索插件').fill('not-found');
  await expect(page.getByText('没有找到匹配的插件。')).toBeVisible();
  await page.getByLabel('搜索插件').fill('plain');
  await page.getByRole('radio', { name: '功能扩展', exact: true }).click();
  await expect(page.locator('[data-catalog-id="test.plain"]')).toHaveCount(0);
  await page.getByRole('radio', { name: '全部', exact: true }).click();
  await confirm(page);
  await expect(page.locator('[data-catalog-id="test.plain"]').getByRole('button')).toHaveText(
    '详情',
  );
  await page.keyboard.press('Escape');
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'online.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('An online-installed reader.'),
  });
  await page.getByRole('button', { name: '阅读 online.txt', exact: true }).click();
  await page.getByLabel('记录阅读次数', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阅读次数 1');
  await page.getByLabel('返回书架', { exact: true }).click();
  await discover(page);
  current = fixture('1.1.0');
  await page.getByRole('button', { name: '刷新目录', exact: true }).click();
  await expect(page.locator('[data-catalog-id="test.plain"]')).toContainText('v1.1.0');
  await page.getByRole('button', { name: '查看 Plain text 详情', exact: true }).click();
  await page.getByRole('button', { name: '确认更新', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '阅读 online.txt', exact: true }).click();
  await page.getByLabel('记录阅读次数', { exact: true }).click();
  await expect(page.getByRole('status')).toContainText('阅读次数 2');
});
test('cancels downloads without installing and recovers from directory and download failures', async ({
  page,
}) => {
  const current = fixture();
  let mode = 'directory-error',
    release: (() => void) | undefined;
  await page.route('**/__leaf_catalog', async (route) => {
    if (route.request().postDataJSON().operation === 'list') {
      await route.fulfill({
        status: mode === 'directory-error' ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          mode === 'directory-error'
            ? { error: 'Directory unavailable' }
            : { result: current.snapshot },
        ),
      });
      return;
    }
    if (mode === 'slow')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route
      .fulfill({
        contentType: 'application/x-ndjson',
        body:
          JSON.stringify(
            mode === 'download-error'
              ? { type: 'error', message: 'Download interrupted' }
              : { type: 'done', data: current.data.toString('base64') },
          ) + '\n',
      })
      .catch(() => {});
  });
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await discover(page);
  await expect(page.getByRole('alert')).toContainText('Directory unavailable');
  mode = 'slow';
  await page.getByRole('button', { name: '刷新目录', exact: true }).click();
  await confirm(page);
  await expect.poll(() => !!release).toBe(true);
  await page.getByRole('button', { name: '取消下载', exact: true }).click();
  release?.();
  await expect(page.getByLabel('插件安装进度')).toHaveCount(0);
  await expect(page.locator('[data-catalog-id="test.plain"]').getByRole('button')).toHaveText(
    '安装',
  );
  mode = 'download-error';
  await confirm(page);
  await expect(page.getByRole('alert')).toContainText('Download interrupted');
  mode = 'ready';
  await confirm(page);
  await expect(page.locator('[data-catalog-id="test.plain"]').getByRole('button')).toHaveText(
    '详情',
  );
});
test('shows incompatibility before installation and labels cached discovery results', async ({
  page,
}) => {
  const current = fixture();
  current.snapshot.catalog.plugins[0].manifest.hostApi = '^2.0.0';
  current.snapshot.offline = true;
  let downloads = 0;
  await page.route('**/__leaf_catalog', async (route) => {
    if (route.request().postDataJSON().operation === 'download') downloads++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ result: current.snapshot }),
    });
  });
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await discover(page);
  await expect(page.getByText(/正在使用离线缓存/)).toBeVisible();
  await page.getByRole('button', { name: '查看 Plain text 详情', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Plain text', exact: true });
  await expect(detail.getByRole('alert')).toContainText('需要更新 Leaf');
  await expect(detail.getByRole('button', { name: '确认安装', exact: true })).toHaveCount(0);
  expect(downloads).toBe(0);
});

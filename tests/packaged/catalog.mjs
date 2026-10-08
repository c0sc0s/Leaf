import { _electron, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const profile = await mkdtemp(path.join(tmpdir(), 'leaf-online-catalog-'));
await mkdir('test-results/catalog', { recursive: true });
const env = { ...process.env, LEAF_HIDDEN_WINDOW: '1', LEAF_USER_DATA: profile };
delete env.LEAF_TEST_PLUGINS;
const launch = () =>
  _electron.launch({
    ...(process.env.LEAF_EXECUTABLE
      ? { executablePath: process.env.LEAF_EXECUTABLE, args: [] }
      : { args: ['.'] }),
    env,
  });
let app = await launch();
try {
  let page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page).toHaveURL('leaf://app/index.html');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.plugin-card')).toHaveCount(1);
  await page.getByRole('tab', { name: '发现插件', exact: true }).click();
  await expect(page.locator('[data-catalog-id]')).toHaveCount(3, { timeout: 30000 });
  await expect(page.getByText(/签名已验证/)).toBeVisible();
  await page
    .locator('.preferences-plugins')
    .screenshot({ path: 'test-results/catalog/discover-light.png' });
  for (const name of ['Markdown 阅读', 'AI 阅读助手']) {
    await page.getByRole('button', { name: `查看 ${name} 详情`, exact: true }).click();
    const detail = page.getByRole('dialog', { name, exact: true });
    await detail.screenshot({
      path: `test-results/catalog/details-${name.startsWith('AI') ? 'ai' : 'markdown'}.png`,
    });
    await detail.getByRole('button', { name: '确认安装', exact: true }).click();
    await expect(page.getByRole('button', { name: `查看 ${name} 详情`, exact: true })).toHaveText(
      '详情',
      { timeout: 120000 },
    );
  }
  await page.getByRole('tab', { name: '已安装', exact: true }).click();
  await expect(page.locator('.plugin-card')).toHaveCount(3);
  for (const id of ['leaf.pdf', 'leaf.markdown', 'leaf.ai'])
    await expect(page.locator(`[data-plugin-id="${id}"]`)).toContainText('已启用');
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await page.getByRole('tab', { name: '发现插件', exact: true }).click();
  await page
    .locator('.preferences-plugins')
    .screenshot({ path: 'test-results/catalog/discover-dark.png' });
  await page
    .getByRole('dialog', { name: '阅读偏好', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.plugin-card')).toHaveCount(3);
  await expect(page.locator('[data-plugin-id="leaf.markdown"]')).toContainText('已启用');
  await expect(page.locator('[data-plugin-id="leaf.ai"]')).toContainText('已启用');
  expect(errors).toEqual([]);
  console.log(
    'Public catalog passed: official signature, real HTTPS downloads, confirmed Markdown/AI installation, native activation and restart persistence.',
  );
} catch (error) {
  const pages = app.windows();
  await pages[0]?.screenshot({ path: 'test-results/catalog/failure.png' }).catch(() => {});
  throw error;
} finally {
  await app.close();
  await rm(profile, { recursive: true, force: true });
}

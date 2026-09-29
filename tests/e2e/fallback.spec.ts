import { test, expect } from '@playwright/test';

test('shows render error stacks and recovers through retry and reload', async ({ page }) => {
  let crash = true;
  await page.route(
    /\/(?:src\/features\/reader\/MarkdownReader\.tsx|assets\/MarkdownReader-[^/]+\.js)(?:\?.*)?$/,
    async (route) => {
      if (!crash) return route.continue();
      await route.fulfill({
        contentType: 'application/javascript',
        body: `export function MarkdownReader() {
          throw new Error('Fallback regression: Markdown render failed');
        }`,
      });
    },
  );

  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'fallback.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Fallback book\n\nStill saved after recovery.'),
  });
  const openBook = page.getByRole('button', { name: '阅读 Fallback book', exact: true });
  await openBook.click();
  await expect(page.getByRole('heading', { name: '应用出现错误', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(
    'Error: Fallback regression: Markdown render failed',
  );
  const stack = page.getByRole('region', { name: '错误栈', exact: true }).locator('pre');
  await expect(stack).toContainText('Error: Fallback regression: Markdown render failed');
  await expect(stack).toContainText('at MarkdownReader');
  await expect(page.getByRole('region', { name: '组件栈', exact: true })).toContainText(
    'MarkdownReader',
  );
  await page.screenshot({ path: test.info().outputPath('fallback.png') });

  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.locator('.error-fallback')).toHaveCount(0);
  await expect(openBook).toBeVisible();
  await openBook.click();
  await expect(page.getByRole('heading', { name: '应用出现错误', exact: true })).toBeVisible();
  crash = false;
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.locator('.error-fallback')).toHaveCount(0);
  await openBook.click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Fallback book');
  await expect(page.locator('.markdown-content')).toContainText('Still saved after recovery.');
});

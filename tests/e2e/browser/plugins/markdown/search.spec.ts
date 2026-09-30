import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('searches code in an imported folder without losing the reader', async ({ page }) => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-search-'));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const source = 'const value = "hello";\nconsole.log(value);\n';
  try {
    await mkdir(path.join(root, 'chapters'));
    await writeFile(
      path.join(root, 'README.md'),
      '# Search introduction\n\n```js\n' + source + '```',
    );
    await writeFile(
      path.join(root, 'chapters', '2.md'),
      '# Nested chapter\n\nA regular prose match.\n\n`const inline = 1`',
    );
    await page.goto('/');
    await expect(page.locator('.book-card')).toHaveCount(8);
    await page.getByLabel('选择文档文件夹', { exact: true }).setInputFiles(root);
    await page.getByRole('button', { name: `阅读 ${path.basename(root)}`, exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Search introduction');
    await expect(page.getByLabel('位置序号', { exact: true })).toHaveValue('1');
    await page.getByLabel('搜索文档', { exact: true }).click();
    const input = page.getByLabel('搜索文档内容', { exact: true });
    await input.fill('const value');
    expect(errors).toEqual([]);
    await expect(page.locator('.markdown-content')).toBeVisible();
    await expect
      .poll(() => page.locator('.markdown-content code mark').allTextContents())
      .toEqual(['const', ' value']);
    await expect(page.locator('.markdown-content pre code')).toHaveText(source);
    await input.fill('CONST VALUE');
    await expect
      .poll(() => page.locator('.markdown-content code mark').allTextContents())
      .toEqual(['const', ' value']);
    await input.fill('');
    await expect(page.locator('.markdown-content mark')).toHaveCount(0);
    await input.pressSequentially('const');
    await expect(page.locator('.search-result')).toHaveCount(2);
    await expect(page.locator('.markdown-content code mark')).toHaveText('const');
    await input.fill('const inline');
    await expect(page.locator('.search-result')).toHaveCount(1);
    await page.locator('.search-result').click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Nested chapter');
    await expect(page.locator('.markdown-content code mark')).toHaveText('const inline');
    await input.fill('regular prose');
    await page.locator('.search-result').click();
    await expect(page.locator('.markdown-content mark')).toHaveText('regular prose');
    await input.fill('no such match');
    await expect(page.locator('.search-result')).toHaveCount(0);
    await expect(page.locator('.markdown-content')).toBeVisible();
    await page.getByLabel('返回书架', { exact: true }).click();
    await page.getByRole('button', { name: `阅读 ${path.basename(root)}`, exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Nested chapter');
    expect(errors).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

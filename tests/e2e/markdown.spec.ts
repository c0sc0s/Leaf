import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

async function library(page: Page) {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
}

test('imports a Markdown file, renders GFM safely and keeps it as a single book', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await library(page);
  const markdown =
    '# Markdown 示例\n\n**强调**与[章节](#细节)。\n\n> 一段安静的阅读时光。\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] 已完成\n\n阅读清单：\n\n- 普通列表\n- 第二项\n\n```js\nconst value = 1;\n```\n\n<script>window.evil = true</script>\n\n[不安全链接](javascript:alert(1))\n\n## 细节\n\n正文内容';
  const payload = { name: 'example.md', mimeType: 'text/markdown', buffer: Buffer.from(markdown) };
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles(payload);
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.getByRole('button', { name: '阅读 Markdown 示例', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Markdown 示例');
  await expect(page.locator('.markdown-content')).toHaveClass(/typeset typeset-docs/);
  await expect(page.locator('.markdown-content')).toHaveCSS('font-size', '18px');
  await expect(page.locator('.markdown-content')).toHaveCSS('line-height', '28.8px');
  await expect(page.locator('.markdown-content h1')).toHaveCSS('font-family', /IBM Plex Sans/);
  await expect(page.locator('.markdown-content pre')).toHaveCSS('font-family', /JetBrains Mono/);
  await expect(page.locator('.markdown-content ul').last()).toHaveCSS('list-style-type', 'disc');
  await expect(page.locator('.markdown-content table')).toHaveCSS('display', 'table');
  await expect(page.locator('.markdown-content blockquote')).toHaveCSS(
    'border-left-style',
    'solid',
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'test-results/markdown-typeset-light.png' });
  await page.getByLabel('放大', { exact: true }).click();
  await expect(page.locator('.markdown-content')).toHaveCSS('font-size', '19.8px');
  await page.getByRole('button', { name: '110%', exact: true }).click();
  await expect(page.locator('.markdown-content table')).toBeVisible();
  await expect(page.locator('.markdown-content input[type=checkbox]')).toBeChecked();
  await expect(page.locator('.markdown-content pre')).toContainText('const value = 1;');
  await expect(page.locator('.markdown-content script')).toHaveCount(0);
  await expect(page.locator('.markdown-content a').last()).toHaveAttribute('href', '');
  await expect(page.getByLabel('下一章', { exact: true })).toBeDisabled();
  await page.getByLabel('添加书签', { exact: true }).click();
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles(payload);
  await expect(page.getByRole('status')).toContainText('已在书库中');
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.reload();
  await page.getByRole('button', { name: '阅读 Markdown 示例', exact: true }).click();
  await expect(page.getByLabel('移除书签', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('imports a folder as one book with nested chapters, images, links and persistent progress', async ({
  page,
}) => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-markdown-'));
  const bookName = path.basename(root);
  try {
    await mkdir(path.join(root, 'chapters'));
    await mkdir(path.join(root, 'images'));
    await writeFile(
      path.join(root, 'README.md'),
      '# Introduction\n\n[Go to chapter](chapters/2.md#details)\n\n![本地图片](images/diagram.svg)',
    );
    await writeFile(path.join(root, 'chapters', '10.md'), '# Last chapter\n\nending');
    await writeFile(
      path.join(root, 'chapters', '2.md'),
      '# Chapter Two\n\n' +
        'A paragraph for reading.\n\n'.repeat(80) +
        '## Details\n\nA unique needle in this chapter.\n\n[Return](../README.md)',
    );
    await writeFile(
      path.join(root, 'images', 'diagram.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="green"/></svg>',
    );
    await writeFile(path.join(root, 'ignored.txt'), 'not a chapter');
    await library(page);
    await page.getByLabel('选择 Markdown 文件夹', { exact: true }).setInputFiles(root);
    await expect(page.locator('.book-card')).toHaveCount(9);
    await page.getByRole('button', { name: `阅读 ${bookName}`, exact: true }).click();
    await expect(page.locator('.outline-item.depth-0')).toHaveCount(3);
    await expect(page.locator('.markdown-content h1')).toHaveText('Introduction');
    await expect
      .poll(() =>
        page.locator('.markdown-content img').evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(200);
    await expect(page.locator('.outline-item.depth-0').nth(1)).toContainText('Chapter Two');
    await expect(page.locator('.reader-sidebar')).not.toContainText('chapters/2.md');
    await page.getByRole('link', { name: 'Go to chapter', exact: true }).click();
    await expect(page.locator('.markdown-content h2')).toBeInViewport();
    await expect(page.locator('.markdown-status')).toContainText('第 2 / 3 章');
    await page.getByLabel('添加书签', { exact: true }).click();
    const scroll = await page.locator('.markdown-scroll').evaluate((node) => node.scrollTop);
    await page.getByLabel('返回书架', { exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: `阅读 ${bookName}`, exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Chapter Two');
    await expect(page.getByLabel('移除书签', { exact: true })).toBeVisible();
    await expect
      .poll(() => page.locator('.markdown-scroll').evaluate((node) => node.scrollTop))
      .toBeGreaterThan(scroll - 5);
    await page.getByLabel('搜索 Markdown', { exact: true }).click();
    await page.getByLabel('搜索 Markdown 内容', { exact: true }).fill('unique needle');
    await page.locator('.markdown-search-result').click();
    await expect(page.locator('.markdown-content mark')).toHaveText('unique needle');
    await expect(page.locator('.markdown-content mark')).toBeInViewport();
    await page.getByLabel('阅读偏好', { exact: true }).click();
    await page.getByRole('radio', { name: '深色', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.markdown-scroll')).toHaveClass(/markdown-dark/);
    await expect(page.locator('.markdown-content')).toHaveCSS('color', 'rgb(222, 222, 227)');
    await page.screenshot({ path: 'test-results/markdown-typeset-dark.png' });
    await page.getByLabel('下一章', { exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Last chapter');
    // Imported content remains readable even when the source directory disappears.
    await rm(root, { recursive: true, force: true });
    await page.getByLabel('上一章', { exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Chapter Two');
    await page.getByLabel('上一章', { exact: true }).click();
    await expect
      .poll(() =>
        page.locator('.markdown-content img').evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(200);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

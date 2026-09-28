import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('reuses the PDF text index across searches and clears obsolete searches', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { indexed: 0 };
    Object.assign(window, { leafSearchMetrics: state });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      private script: string;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.script = String(url);
      }
      postMessage(message: { payload?: { text?: string } }, options?: StructuredSerializeOptions) {
        if (this.script.includes('search.worker') && typeof message.payload?.text === 'string')
          state.indexed++;
        super.postMessage(message, options || {});
      }
    };
  });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('Search cache specimen');
  for (let n = 1; n <= 61; n++) {
    pdf.addPage([600, 800]).drawText(`Page ${n} ALPHA ${n === 61 ? 'OMEGA' : 'ordinary'}`, {
      font,
      size: 14,
      x: 50,
      y: 700,
    });
  }
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'cache.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Search cache specimen', exact: true }).click();
  await expect(page.locator('.pdf-paper[data-page="1"]')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('搜索 PDF', { exact: true }).click();
  const input = page.getByLabel('搜索文档内容', { exact: true });
  await input.fill('ALPHA');
  await expect(page.locator('.search-status')).toHaveText('61 处结果 · 61 页');
  const indexed = () =>
    page.evaluate(
      () =>
        (window as Window & { leafSearchMetrics: { indexed: number } }).leafSearchMetrics.indexed,
    );
  expect(await indexed()).toBe(61);
  await input.fill('OMEGA');
  await expect(page.locator('.search-status')).toHaveText('1 处结果 · 1 页');
  await expect(page.locator('.search-result')).toContainText('第 61 页');
  expect(await indexed()).toBe(61);
  await input.fill('ALPHA');
  await expect(page.locator('.search-status')).toContainText('正在检索');
  await input.fill('absent');
  await expect(page.locator('.search-status')).toHaveText('0 处结果 · 0 页');
  await input.fill('');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await expect(page.locator('.search-status')).toHaveText('输入关键词，搜索所有页面');
  expect(await indexed()).toBe(61);
});

test('keeps Markdown nodes and code state when toggling panels and selecting text', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'stable.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Stable content\n\n[Local heading](#stable-content)\n\nSelectable words.\n\n```js\nconst value = 1;\n```',
    ),
  });
  await page.getByRole('button', { name: '阅读 Stable content', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Stable content');
  const link = await page.getByRole('link', { name: 'Local heading', exact: true }).elementHandle();
  const code = await page.locator('.markdown-code-block').elementHandle();
  await page.getByLabel('搜索 Markdown', { exact: true }).click();
  await page.getByLabel('阅读笔记', { exact: true }).click();
  await page.getByLabel('关闭笔记', { exact: true }).click();
  await page
    .locator('.markdown-content p')
    .nth(1)
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
  await expect(page.getByRole('toolbar', { name: '选中文字操作', exact: true })).toBeVisible();
  expect(await link!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await code!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator('.markdown-code-block code')).toHaveText('const value = 1;\n');
});

test('uses the latest chapter while the Markdown worker is still starting', async ({ page }) => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-worker-navigation-'));
  try {
    for (const [name, title] of [
      ['1.md', 'First'],
      ['2.md', 'Second'],
      ['3.md', 'Third'],
    ])
      await writeFile(path.join(root, name), `# ${title}\n\nBody for ${title}.`);
    await page.goto('/');
    await expect(page.locator('.book-card')).toHaveCount(8);
    await page.getByLabel('选择 Markdown 文件夹', { exact: true }).setInputFiles(root);
    await page.route('**/src/features/reader/markdown.worker.ts*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.getByRole('button', { name: `阅读 ${path.basename(root)}`, exact: true }).click();
    await page.getByLabel('下一章', { exact: true }).click();
    await page.getByLabel('下一章', { exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Third');
    await expect(page.locator('.markdown-status')).toContainText('第 3 / 3 章');
    await page.getByLabel('上一章', { exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Second');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

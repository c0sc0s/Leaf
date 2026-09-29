import { _electron, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

// Exercise the current build over file:// without repackaging the installer.
const directory = await mkdtemp(path.join(tmpdir(), 'leaf-production-'));
const markdownFile = path.join(directory, 'production.md');
const pdfFile = path.join(directory, 'production.pdf');
const output = path.join(directory, 'annotated.pdf');
await writeFile(
  markdownFile,
  '# Production Markdown\n\nA &amp; B &copy;. A unique needle.\n\n```js\nconst value = 1;\n```',
);
const source = await PDFDocument.create();
source.setTitle('Production PDF');
const font = await source.embedFont(StandardFonts.Helvetica);
for (let page = 1; page <= 3; page++)
  source
    .addPage([600, 800])
    .drawText(`Production ALPHA ${page}`, { font, size: 18, x: 50, y: 700 });
await writeFile(pdfFile, await source.save());
const app = await _electron.launch({
  ...(process.env.LEAF_EXECUTABLE
    ? { executablePath: process.env.LEAF_EXECUTABLE, args: [] }
    : { args: ['electron/main.cjs'] }),
  env: { LEAF_HIDDEN_WINDOW: '1', ...process.env, LEAF_USER_DATA: path.join(directory, 'profile') },
});
try {
  const page = await app.firstWindow();
  expect(page.url()).toMatch(/^file:\/\//);
  const errors = [];
  const workers = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('worker', (worker) => workers.push(worker.url()));
  await expect(page.locator('.book-card')).toHaveCount(8, { timeout: 30000 });
  const choose = async (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
  await choose(markdownFile);
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.getByRole('button', { name: '阅读 Production Markdown', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Production Markdown');
  await expect(page.locator('.markdown-content p')).toHaveText('A & B ©. A unique needle.');
  await expect(page.locator('.markdown-content .hljs-keyword')).toHaveText('const');
  await page.getByLabel('搜索 Markdown', { exact: true }).click();
  await page.getByLabel('搜索 Markdown 内容', { exact: true }).fill('unique needle');
  await expect(page.locator('.markdown-search-result')).toHaveCount(1);
  await page.getByLabel('返回书架', { exact: true }).click();
  await choose(pdfFile);
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await expect(page.locator('.book-card')).toHaveCount(10);
  await page.getByRole('button', { name: '阅读 Production PDF', exact: true }).click();
  await expect(page.locator('.pdf-paper[data-page="1"]')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('搜索 PDF', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('ALPHA');
  await expect(page.locator('.search-status')).toHaveText('3 处结果 · 3 页');
  await page
    .locator('.textLayer [data-start]')
    .filter({ hasText: 'Production ALPHA 1' })
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
  await page.getByLabel('高光标注', { exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已导出');
  const result = await PDFDocument.load(await readFile(output));
  expect(result.getPageCount()).toBe(3);
  expect(result.getPage(0).node.get(PDFName.of('Annots'))).toBeTruthy();
  for (const name of ['markdown.worker', 'search.worker', 'export.worker'])
    expect(workers.some((url) => url.includes(name))).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    'Production file:// checks passed: lazy readers, native import/save, Markdown entities/highlighting/search, PDF search and worker annotation export.',
  );
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}

import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { switchReaderToDark } from '../../../support/reader-menu';
async function openBook(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await page.getByLabel('位置序号', { exact: true }).fill('2');
  await page.getByLabel('位置序号', { exact: true }).press('Enter');
  await expect(
    page.locator('.textLayer [data-start]').filter({ hasText: 'We move' }),
  ).toBeVisible();
}
async function select(page: import('@playwright/test').Page, selector: string, text = '') {
  const target = page.locator(selector).filter({ hasText: text }).first();
  await target.scrollIntoViewIfNeeded();
  await target.evaluate((el) => {
    const node = el.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, Math.min(node.textContent!.length, 60));
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
}
test('renders PDFs, persists annotations, exports native PDF marks and restores progress', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openBook(page);
  await select(page, '.textLayer [data-start]', 'We move');
  await page.getByLabel('高光标注', { exact: true }).click();
  await expect(page.locator('.annotation-overlay rect')).toHaveCount(1);
  await select(page, '.textLayer [data-start]', 'We move');
  await page.getByLabel('划线标注', { exact: true }).click();
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await page.getByLabel('第 2 页批注笔记').first().fill('A lasting thought');
  await page.getByLabel('第 2 页批注笔记').first().press('Tab');
  await switchReaderToDark(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reading-surface')).toHaveClass(/reader-dark/);
  await expect(page.locator('.pdf-paper[data-page="2"]')).toHaveClass(/dark-paper/);
  await expect(page.locator('.annotation-overlay line')).toHaveCount(1);
  await page.getByLabel('添加书签', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '导出批注 PDF', exact: true }).click();
  const file = await download;
  const exported = await PDFDocument.load(await readFile((await file.path())!));
  const pageNode = exported.getPage(1).node;
  expect(pageNode.get(PDFName.of('Annots'))).toBeTruthy();
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await expect(page.getByLabel('位置序号', { exact: true })).toHaveValue('2');
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.getByLabel('第 2 页批注笔记').first()).toHaveValue('A lasting thought');
  await expect(page.getByLabel('移除书签', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
import { PDFName } from 'pdf-lib';
test('preserves a page chosen while the PDF worker is still loading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.route('**/*pdf.worker*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await page.getByLabel('位置序号', { exact: true }).fill('2');
  await page.getByLabel('位置序号', { exact: true }).press('Enter');
  await expect(
    page.locator('.textLayer [data-start]').filter({ hasText: 'We move' }),
  ).toBeVisible();
  await expect(page.getByLabel('位置序号', { exact: true })).toHaveValue('2');
});
test('imports real files, rejects duplicates, searches all pages and locates search results', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('Imported specimen');
  pdf.addPage().drawText('A searchable imported document.', { font });
  pdf.addPage().drawText('Needle exists on the second page.', { font });
  const data = Buffer.from(await pdf.save());
  await page
    .getByLabel('选择阅读文件', { exact: true })
    .setInputFiles({ name: 'imported.pdf', mimeType: 'application/pdf', buffer: data });
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page
    .getByLabel('选择阅读文件', { exact: true })
    .setInputFiles({ name: 'again.pdf', mimeType: 'application/pdf', buffer: data });
  await expect(page.getByRole('status')).toContainText('已在书库中');
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.getByRole('button', { name: '阅读 Imported specimen', exact: true }).click();
  await page.getByLabel('搜索文档', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('Needle');
  await page.locator('.search-result').click();
  await expect(page.getByLabel('位置序号', { exact: true })).toHaveValue('2');
  await expect(page.locator('.pdf-paper[data-page="2"] .search-matches rect')).toHaveCount(1);
  await expect(page.locator('.pdf-paper[data-page="2"]')).toBeInViewport();
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByLabel('搜索书库', { exact: true }).fill('Imported');
  await expect(page.locator('.book-card')).toHaveCount(1);
});

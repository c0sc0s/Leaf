import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
async function openBook(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await page.getByLabel('页码', { exact: true }).fill('2');
  await page.getByLabel('页码', { exact: true }).press('Enter');
  await expect(
    page.locator('.textLayer [data-start]').filter({ hasText: 'We move' }),
  ).toBeVisible();
}
async function select(page: import('@playwright/test').Page, selector: string, text = '') {
  await page
    .locator(selector)
    .filter({ hasText: text })
    .first()
    .evaluate((el) => {
      const node = el.firstChild!;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(node.textContent!.length, 60));
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
}
test('renders PDFs, persists cross-mode annotations, exports native PDF marks and restores progress', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openBook(page);
  await select(page, '.textLayer [data-start]', 'We move');
  await page.getByLabel('高光标注', { exact: true }).click();
  await expect(page.locator('.annotation-overlay rect')).toHaveCount(1);
  await page.getByRole('button', { name: '舒适阅读', exact: true }).click();
  await expect(page.locator('.reflow-content')).toContainText('We move through the world');
  await expect(page.locator('.reflow-content span[style*=background]')).toHaveCount(1);
  await select(page, '.reflow-content p [data-start]');
  await page.getByLabel('划线标注', { exact: true }).click();
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await page.getByLabel('第 2 页批注笔记').first().fill('A lasting thought');
  await page.getByLabel('第 2 页批注笔记').first().press('Tab');
  await page.getByLabel('切换深色模式', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.reading-canvas')).toHaveClass(/reader-dark/);
  await page.getByRole('button', { name: '原版阅读', exact: true }).click();
  await expect(page.locator('.pdf-paper')).toHaveClass(/dark-paper/);
  await expect(page.locator('.annotation-overlay line')).toHaveCount(1);
  await page.getByLabel('添加书签', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByLabel('导出批注 PDF', { exact: true }).click();
  const file = await download;
  const exported = await PDFDocument.load(await readFile((await file.path())!));
  const pageNode = exported.getPage(1).node;
  expect(pageNode.get(PDFName.of('Annots'))).toBeTruthy();
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('2');
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.getByLabel('第 2 页批注笔记').first()).toHaveValue('A lasting thought');
  await expect(page.getByLabel('移除书签', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
import { PDFName } from 'pdf-lib';
test('imports real files, rejects duplicates, searches all pages and changes typography', async ({
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
    .getByLabel('选择 PDF 文件', { exact: true })
    .setInputFiles({ name: 'imported.pdf', mimeType: 'application/pdf', buffer: data });
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page
    .getByLabel('选择 PDF 文件', { exact: true })
    .setInputFiles({ name: 'again.pdf', mimeType: 'application/pdf', buffer: data });
  await expect(page.getByRole('status')).toContainText('已在书库中');
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.getByRole('button', { name: '阅读 Imported specimen', exact: true }).click();
  await page.getByLabel('搜索 PDF', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('Needle');
  await page.locator('.search-result').click();
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('2');
  await expect(page.locator('.search-match')).toHaveText('Needle');
  await page.getByLabel('阅读偏好', { exact: true }).click();
  await page.getByLabel('字号').fill('25');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.reflow-article')).toHaveCSS('font-size', '25px');
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByLabel('搜索书库', { exact: true }).fill('Imported');
  await expect(page.locator('.book-card')).toHaveCount(1);
});
test('image-only pages offer OCR rather than fabricated text', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  const pdf = await PDFDocument.create();
  pdf.setTitle('Image-only test');
  pdf.addPage();
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({
    name: 'scan.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Image-only test', exact: true }).click();
  await page.getByRole('button', { name: '舒适阅读', exact: true }).click();
  await expect(page.getByRole('button', { name: '识别本页文字', exact: true })).toBeVisible();
  await expect(page.locator('.reflow-content')).toBeEmpty();
});

test('recognizes a scanned page offline and persists OCR text and marks', async ({ page }) => {
  test.setTimeout(120000);
  const sharp = (await import('sharp')).default;
  const image = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650"><rect width="1200" height="650" fill="white"/><text x="70" y="160" fill="black" font-family="Arial" font-size="50">Reading is a quiet adventure.</text><text x="70" y="245" fill="black" font-family="Arial" font-size="36">This scanned page becomes selectable text.</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  const pdf = await PDFDocument.create();
  pdf.setTitle('Scanned specimen');
  const png = await pdf.embedPng(image);
  pdf.addPage([600, 325]).drawImage(png, { x: 0, y: 0, width: 600, height: 325 });
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({
    name: 'scan-ocr.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Scanned specimen', exact: true }).click();
  await page.getByRole('button', { name: '舒适阅读', exact: true }).click();
  await page.getByRole('button', { name: '识别本页文字', exact: true }).click();
  await expect(page.locator('.reflow-content')).toContainText('Reading is a quiet adventure', {
    timeout: 90000,
  });
  await select(page, '.reflow-content [data-start]');
  await page.getByLabel('高光标注', { exact: true }).click();
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '阅读 Scanned specimen', exact: true }).click();
  await page.getByRole('button', { name: '舒适阅读', exact: true }).click();
  await expect(page.locator('.reflow-content')).toContainText('Reading is a quiet adventure');
  await expect(page.locator('.reflow-content span[style*=background]')).toHaveCount(1);
});

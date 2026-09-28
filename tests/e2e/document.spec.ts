import { test, expect } from '@playwright/test';
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFString,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import sharp from 'sharp';

async function specimen(scan = false) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(scan ? 'Late scanned page' : 'Complete illustrated book');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const photo = await sharp(
    Buffer.from(
      '<svg width="360" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="360" height="160" fill="#89b9cb"/><circle cx="240" cy="55" r="28" fill="#ffd469"/><path d="M0 160L130 45L230 160Z" fill="#345c51"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const image = await pdf.embedPng(photo);
  for (let i = 0; i < 3; i++) {
    const p = pdf.addPage([600, 800]);
    p.drawText(`Chapter ${i + 1}`, { x: 50, y: 730, size: 24, font });
    p.drawText(`Body on page ${i + 1} stays selectable in our own reading layout.`, {
      x: 50,
      y: 680,
      size: 14,
      font,
    });
    if (i === 1) {
      p.drawImage(image, { x: 80, y: 440, width: 360, height: 160 });
      p.drawText('Figure 1. An independent photograph.', { x: 80, y: 410, size: 12, font });
    }
    if (i === 2) {
      p.drawRectangle({
        x: 70,
        y: 450,
        width: 140,
        height: 80,
        borderWidth: 2,
        borderColor: rgb(0.2, 0.4, 0.6),
      });
      p.drawRectangle({
        x: 320,
        y: 450,
        width: 140,
        height: 80,
        borderWidth: 2,
        borderColor: rgb(0.2, 0.4, 0.6),
      });
      p.drawLine({ start: { x: 210, y: 490 }, end: { x: 320, y: 490 }, thickness: 2 });
      p.drawText('Service A', { x: 90, y: 483, size: 14, font });
      p.drawText('Service B', { x: 340, y: 483, size: 14, font });
      p.drawText('Figure 2. Architecture diagram.', { x: 70, y: 410, size: 12, font });
    }
  }
  if (scan) {
    const p = pdf.addPage([600, 800]);
    p.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
    pdf
      .addPage([600, 800])
      .drawText('Final page must also be analyzed.', { x: 50, y: 600, size: 14, font });
  }
  return Buffer.from(await pdf.save());
}
async function importBook(page: import('@playwright/test').Page, buffer: Buffer, title: string) {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page
    .getByLabel('选择 PDF 文件', { exact: true })
    .setInputFiles({ name: 'whole-book.pdf', mimeType: 'application/pdf', buffer });
  await page.getByRole('button', { name: `阅读 ${title}`, exact: true }).click();
}
test('reflows every page as one article with pictures and vector diagrams, and switches the entire book', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await importBook(page, await specimen(), 'Complete illustrated book');
  await expect(page.locator('.document-status')).toContainText('全书 3 页已检查 · 支持统一阅读');
  await expect(page.locator('.reflow-content [data-source-page]')).toHaveCount(3);
  await expect(page.locator('.reflow-figure img')).toHaveCount(2);
  await expect(page.locator('.reflow-content')).toContainText('Body on page 1');
  await expect(page.locator('.reflow-content')).toContainText('Body on page 3');
  await expect(page.locator('.figure-caption')).toHaveCount(2);
  await expect(page.locator('.reading-canvas canvas')).toHaveCount(0);
  const sizes = await page.locator('.reflow-figure img').evaluateAll((images) =>
    images.map((image) => ({
      width: (image as HTMLImageElement).naturalWidth,
      height: (image as HTMLImageElement).naturalHeight,
    })),
  );
  expect(sizes.every((size) => size.height < 400)).toBe(true);
  await page.getByRole('button', { name: '原版阅读', exact: true }).click();
  await expect(page.locator('.pdf-paper canvas')).toBeVisible();
  await expect(page.locator('.reflow-article')).toHaveCount(0);
  await page.getByRole('button', { name: '统一阅读', exact: true }).click();
  await expect(page.locator('.reflow-content [data-source-page]')).toHaveCount(3);
  await page.getByLabel('页码', { exact: true }).fill('3');
  await page.getByLabel('页码', { exact: true }).press('Enter');
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('3');
  await page.getByLabel('切换深色模式', { exact: true }).click();
  await expect(page.locator('.reading-canvas')).toHaveClass(/reader-dark/);
  expect(errors).toEqual([]);
});
test('checks past a late scanned page and keeps the whole book in original mode without OCR or page screenshot fallback', async ({
  page,
}) => {
  await importBook(page, await specimen(true), 'Late scanned page');
  await expect(page.locator('.document-status')).toContainText('已检查 5 / 5 页 · 整本原版阅读');
  await expect(page.locator('.pdf-paper canvas')).toBeVisible();
  await page.getByRole('button', { name: '统一阅读', exact: true }).click();
  await expect(page.getByRole('region', { name: '全书重排分析' })).toContainText('第 4 页');
  await expect(page.locator('.reflow-article')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '识别本页文字', exact: true })).toHaveCount(0);
  await page.getByLabel('页码', { exact: true }).fill('5');
  await page.getByLabel('页码', { exact: true }).press('Enter');
  await expect(page.locator('.textLayer')).toContainText('Final page must also be analyzed.');
  await expect(page.locator('.pdf-paper canvas')).toBeVisible();
});
test('stores cross-page text highlights with original page provenance', async ({ page }) => {
  await importBook(page, await specimen(), 'Complete illustrated book');
  await expect(page.locator('.reflow-content [data-source-page]')).toHaveCount(3);
  await page.locator('.reflow-content').evaluate((root) => {
    const first = root.querySelector('[data-source-page="1"] p [data-start]')!;
    const second = root.querySelector('[data-source-page="2"] p [data-start]')!;
    const range = document.createRange();
    range.setStart(first.firstChild!, 0);
    range.setEnd(second.firstChild!, 15);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('高光标注', { exact: true }).click();
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await expect(page.getByLabel('第 1 页批注笔记')).toBeVisible();
  await expect(page.getByLabel('第 2 页批注笔记')).toBeVisible();
  await page.getByRole('button', { name: '原版阅读', exact: true }).click();
  await page.getByLabel('页码', { exact: true }).fill('2');
  await page.getByLabel('页码', { exact: true }).press('Enter');
  await expect(page.locator('.annotation-overlay rect').first()).toBeVisible();
});
test('uses tagged logical order and retains a complex formula as an independent image block', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Tagged structure specimen');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const p = pdf.addPage([600, 800]);
  const root = pdf.context.obj({ Type: 'StructTreeRoot' });
  const rootRef = pdf.context.register(root);
  const picture = await pdf.embedPng(
    await sharp({ create: { width: 200, height: 100, channels: 3, background: '#87aabb' } })
      .png()
      .toBuffer(),
  );
  const elements = [
    { role: 'H1', text: 'Logical title comes first', y: 400, size: 24 },
    {
      role: 'P',
      text: 'Body belongs after the title despite its higher position.',
      y: 600,
      size: 14,
    },
    { role: 'BlockQuote', text: 'A quotation kept in the article.', y: 350, size: 14 },
    { role: 'LI', text: '1. A list item kept in the article.', y: 310, size: 14 },
    { role: 'Formula', text: 'x = sqrt(a^2 + b^2)', y: 250, size: 20 },
    { role: 'Caption', text: 'The original formula is preserved as a figure.', y: 210, size: 12 },
    { role: 'Figure', text: '', y: 650, size: 14 },
  ];
  const refs = elements.map((element, i) => {
    p.pushOperators(
      PDFOperator.of('BDC', [PDFName.of(element.role), pdf.context.obj({ MCID: i })]),
    );
    if (element.role === 'Figure')
      p.drawImage(picture, { x: 50, y: element.y, width: 200, height: 100 });
    else p.drawText(element.text, { x: 50, y: element.y, size: element.size, font });
    p.pushOperators(PDFOperator.of('EMC'));
    return pdf.context.register(
      pdf.context.obj({
        Type: 'StructElem',
        S: element.role,
        P: rootRef,
        Pg: p.ref,
        K: i,
        ...(element.role === 'Figure'
          ? { Alt: PDFString.of('A blue architecture illustration') }
          : {}),
      }),
    );
  });
  root.set(PDFName.of('K'), pdf.context.obj(refs));
  root.set(PDFName.of('ParentTree'), pdf.context.register(pdf.context.obj({ Nums: [0, refs] })));
  p.node.set(PDFName.of('StructParents'), PDFNumber.of(0));
  pdf.catalog.set(PDFName.of('StructTreeRoot'), rootRef);
  pdf.catalog.set(PDFName.of('MarkInfo'), pdf.context.obj({ Marked: true }));
  await importBook(page, Buffer.from(await pdf.save()), 'Tagged structure specimen');
  await expect(page.locator('.document-status')).toContainText('支持统一阅读');
  await expect(page.locator('.reflow-content h1')).toHaveText('Logical title comes first');
  await expect(page.locator('.reflow-content blockquote')).toHaveText(
    'A quotation kept in the article.',
  );
  await expect(page.locator('.reflow-content .list-line')).toContainText('A list item');
  await expect(page.locator('.reflow-content .figure-caption')).toContainText('original formula');
  await expect(page.locator('[data-content-kind="formula"] img')).toHaveCount(1);
  await expect(
    page.getByRole('img', { name: 'A blue architecture illustration', exact: true }),
  ).toHaveCount(1);
  expect(
    await page
      .locator('.reflow-content section')
      .evaluate((section) =>
        [...section.children]
          .filter((child) => ['H1', 'P', 'BLOCKQUOTE', 'FIGURE'].includes(child.tagName))
          .map((child) => child.tagName),
      ),
  ).toEqual(['H1', 'P', 'BLOCKQUOTE', 'P', 'FIGURE', 'P', 'FIGURE']);
});
test('falls back for ambiguous tables on a later page', async ({ page }) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Ambiguous table specimen');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage([600, 800])
    .drawText('An ordinary readable first page.', { x: 50, y: 650, size: 14, font });
  const p = pdf.addPage([600, 800]);
  for (let i = 0; i < 5; i++) {
    p.drawText(`Cell ${i}`, { x: 50, y: 650 - i * 24, size: 14, font });
    p.drawText(`${i * 10}`, { x: 250, y: 650 - i * 24, size: 14, font });
    p.drawText('Status', { x: 430, y: 650 - i * 24, size: 14, font });
  }
  await importBook(page, Buffer.from(await pdf.save()), 'Ambiguous table specimen');
  await expect(page.locator('.document-status')).toContainText('已检查 2 / 2 页 · 整本原版阅读');
  await page.locator('.document-status button').click();
  await expect(page.getByRole('region', { name: '全书重排分析' })).toContainText('第 2 页');
  await expect(page.locator('.reflow-article')).toHaveCount(0);
});
test('keeps framed partial-page scans in original mode even when native title text is available', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Partial scan specimen');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([600, 800]).drawText('A readable first page.', { x: 50, y: 700, size: 14, font });
  const p = pdf.addPage([600, 800]);
  p.drawText('Native title above a scan', { x: 50, y: 750, size: 20, font });
  const bitmap = await pdf.embedPng(
    await sharp(
      Buffer.from(
        '<svg width="1000" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="1000" height="700" fill="white"/><text x="50" y="100" font-size="40">Scanned body stays in original mode.</text></svg>',
      ),
    )
      .png()
      .toBuffer(),
  );
  p.drawImage(bitmap, { x: 50, y: 300, width: 500, height: 350 });
  p.drawRectangle({
    x: 50,
    y: 300,
    width: 500,
    height: 350,
    borderWidth: 1,
    borderColor: rgb(0.2, 0.2, 0.2),
  });
  await importBook(page, Buffer.from(await pdf.save()), 'Partial scan specimen');
  await expect(page.locator('.document-status')).toContainText('已检查 2 / 2 页 · 整本原版阅读');
  await page.locator('.document-status button').click();
  await expect(page.getByRole('region', { name: '全书重排分析' })).toContainText('未标记图像');
  await expect(page.locator('.reflow-content')).toHaveCount(0);
});
test('uses PDF user units consistently for text and graphic extraction', async ({ page }) => {
  const pdf = await PDFDocument.load(await specimen());
  pdf.setTitle('Scaled user units specimen');
  for (const p of pdf.getPages()) p.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
  await importBook(page, Buffer.from(await pdf.save()), 'Scaled user units specimen');
  await expect(page.locator('.document-status')).toContainText('支持统一阅读');
  await expect(page.locator('.reflow-figure img')).toHaveCount(2);
  await expect(page.locator('.reflow-content')).toContainText('Body on page 3');
});

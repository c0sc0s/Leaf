import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
async function openBook(page: Page) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('Reading details specimen');
  for (let n = 1; n <= 4; n++) {
    const sheet = pdf.addPage([600, 850]);
    for (let i = 0; i < 24; i++)
      sheet.drawText(`Page ${n} line ${i}. A clear sentence for precise reading.`, {
        font,
        size: 14,
        x: 50,
        y: 780 - i * 28,
      });
    sheet.drawText('Common phrase. Common phrase.', { font, size: 14, x: 50, y: 60 });
  }
  pdf.getPage(0).drawText('Go to reference', { font, size: 14, x: 50, y: 810 });
  const link = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [50, 805, 160, 825],
      Border: [0, 0, 0],
      Dest: [pdf.getPage(2).ref, PDFName.of('XYZ'), 0, 600, null],
    }),
  );
  pdf.getPage(0).node.set(PDFName.of('Annots'), pdf.context.obj([link]));
  pdf.catalog.set(
    PDFName.of('PageLabels'),
    pdf.context.obj({ Nums: [0, { S: 'r' }, 2, { S: 'D', St: 1 }] }),
  );
  const outlines = pdf.context.obj({ Type: 'Outlines', Count: 1 }),
    root = pdf.context.register(outlines);
  const chapter = pdf.context.register(
    pdf.context.obj({
      Title: PDFString.of('Reference chapter'),
      Parent: root,
      Dest: [pdf.getPage(2).ref, PDFName.of('XYZ'), 0, 600, null],
    }),
  );
  outlines.set(PDFName.of('First'), chapter);
  outlines.set(PDFName.of('Last'), chapter);
  pdf.catalog.set(PDFName.of('Outlines'), root);
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({
    name: 'details.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Reading details specimen', exact: true }).click();
  await expect(page.locator('.pdf-paper[data-page="1"]')).toHaveAttribute('aria-busy', 'false');
}
async function selectLine(page: Page, line = 2) {
  await page
    .locator('.pdf-paper[data-page="1"] [data-start]')
    .filter({ hasText: `Page 1 line ${line}.` })
    .evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
}
test('edits a highlight in place, opens notes without resizing, and supports lightweight delete undo', async ({
  page,
}) => {
  await openBook(page);
  await selectLine(page);
  await page.getByLabel('高光标注', { exact: true }).click();
  const rect = page.locator('.pdf-paper[data-page="1"] [data-mark-id] rect');
  await expect(rect).toHaveCount(1);
  const box = (await rect.boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await expect(page.getByRole('toolbar', { name: '编辑批注', exact: true })).toBeVisible();
  await page.getByLabel('green 批注颜色', { exact: true }).click();
  await expect(rect).toHaveAttribute('fill', '#72b49a');
  const before = await page.locator('.pdf-paper[data-page="1"]').boundingBox();
  await page.getByLabel('编辑这条笔记', { exact: true }).click();
  await expect(page.getByLabel('第 1 页批注笔记')).toBeFocused();
  await page.getByLabel('第 1 页批注笔记').fill('An unobtrusive note.');
  await expect(page.locator('.save-state')).toHaveText('已保存');
  const after = await page.locator('.pdf-paper[data-page="1"]').boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.x).toBe(before!.x);
  expect(after!.y).toBe(before!.y);
  await page.getByLabel('关闭笔记', { exact: true }).click();
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await page
    .getByRole('toolbar', { name: '编辑批注', exact: true })
    .getByLabel('删除这条批注', { exact: true })
    .click();
  await expect(rect).toHaveCount(0);
  await page.locator('.undo-notice').getByRole('button', { name: '撤销', exact: true }).click();
  await expect(rect).toHaveCount(1);
  await expect(rect).toHaveAttribute('fill', '#72b49a');
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: '连续高亮', exact: true }).click();
  await selectLine(page, 4);
  await expect(page.locator('.pdf-paper[data-page="1"] [data-mark-id]')).toHaveCount(2);
  await expect(page.getByRole('toolbar', { name: '选中文字操作', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.active-tool')).toHaveCount(0);
});
test('distinguishes search matches, navigates internal references and shows printed page labels', async ({
  page,
}) => {
  await openBook(page);
  await expect(page.locator('.printed-page')).toContainText('i');
  await page.getByLabel('跳转文档链接', { exact: true }).click();
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('3');
  await page.getByLabel('返回刚才的位置', { exact: true }).click();
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('1');
  await page.getByLabel('文档导航', { exact: true }).click();
  await page.getByRole('tab', { name: '文档目录', exact: true }).click();
  await page.locator('.outline-item').filter({ hasText: 'Reference chapter' }).click();
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('3');
  await expect(page.locator('.outline-item.selected')).toContainText('Reference chapter');
  await page.keyboard.press('ControlOrMeta+=');
  await expect(page.locator('.zoom-label')).toHaveText('110%');
  await page.keyboard.press('ControlOrMeta+-');
  await expect(page.locator('.zoom-label')).toHaveText('100%');
  await page.getByLabel('搜索 PDF', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('Common phrase');
  await expect(page.locator('.search-result')).toHaveCount(8);
  await page.locator('.search-result').nth(1).click();
  const current = page.locator('.pdf-paper[data-page="1"] .current-search-match');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('opacity', '0.65');
  await expect(
    page.locator('.pdf-paper[data-page="1"] .search-matches rect:not(.current-search-match)'),
  ).toHaveAttribute('opacity', '0.28');
  await page.getByLabel('页码', { exact: true }).fill('4');
  await page.getByLabel('页码', { exact: true }).press('Enter');
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('4');
  await expect(page.locator('.printed-page')).toContainText('2');
});

test('scrolls at a bounded speed while extending selection near a page edge and stops on release', async ({
  page,
}) => {
  await openBook(page);
  const line = (await page
    .locator('.pdf-paper[data-page="1"] [data-start]')
    .filter({ hasText: 'Page 1 line 1.' })
    .boundingBox())!;
  const box = (await page.locator('.reading-canvas').boundingBox())!;
  await page.mouse.move(line.x + 5, line.y + line.height / 2);
  await page.mouse.down();
  await page.mouse.move(line.x + 150, box.y + box.height - 8, { steps: 10 });
  const before = await page.locator('.reading-canvas').evaluate((el) => el.scrollTop);
  await page.waitForTimeout(450);
  const after = await page.locator('.reading-canvas').evaluate((el) => el.scrollTop);
  expect(after - before).toBeGreaterThan(60);
  expect(after - before).toBeLessThan(500);
  await page.mouse.up();
  await page.waitForTimeout(50);
  const released = await page.locator('.reading-canvas').evaluate((el) => el.scrollTop);
  await page.waitForTimeout(150);
  expect(await page.locator('.reading-canvas').evaluate((el) => el.scrollTop)).toBe(released);
});

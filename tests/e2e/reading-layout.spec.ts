import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

test('prioritizes the page and provides one search entry and reversible focus mode', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await expect(page.locator('.reflow-content')).toBeVisible();
  await expect(page.locator('.titlebar')).toHaveCount(0);
  await expect(page.locator('.reader-header')).toHaveCSS('height', '52px');
  expect((await page.locator('.reading-canvas').boundingBox())!.height).toBeGreaterThanOrEqual(550);
  expect(
    await page.locator('.reader-header').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByLabel('文档导航', { exact: true }).click();
  await expect(page.getByRole('tab', { name: '页面缩略图' })).toBeVisible();
  await expect(page.getByRole('button', { name: /搜索/ })).toHaveCount(1);
  await page.getByLabel('搜索 PDF', { exact: true }).click();
  await expect(page.getByLabel('搜索文档内容', { exact: true })).toBeFocused();
  await expect(page.getByRole('tablist')).toHaveCount(0);
  await page.getByLabel('专注阅读（F）', { exact: true }).click();
  await expect(page.locator('.reader-sidebar')).toHaveCount(0);
  expect((await page.locator('.reading-canvas').boundingBox())!.height).toBeGreaterThanOrEqual(599);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('搜索文档内容', { exact: true })).toBeFocused();
  await page.getByLabel('专注阅读（F）', { exact: true }).click();
  await page.keyboard.press('ControlOrMeta+f');
  await expect(page.getByLabel('搜索文档内容', { exact: true })).toBeFocused();
});

test('swaps complete pages without blank frames and preserves a reading anchor on resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 640 });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('Page navigation specimen');
  for (let n = 1; n <= 4; n++) {
    const sheet = pdf.addPage(n === 3 ? [720, 1400] : [600, 1200]);
    for (let line = 0; line < 36; line++)
      sheet.drawText(`Page ${n} line ${line} - stable reading position.`, {
        font,
        size: 14,
        x: 50,
        y: 1100 - line * 28,
      });
  }
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({
    name: 'navigation.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Page navigation specimen', exact: true }).click();
  await page.getByRole('button', { name: '原版阅读', exact: true }).click();
  const paper = page.locator('.pdf-paper');
  await expect(paper).toHaveAttribute('aria-busy', 'false');
  await page.locator('.reading-canvas').evaluate((el) => {
    const samples: number[] = [];
    (window as any).pageFrames = samples;
    const observer = new MutationObserver(() =>
      samples.push(el.querySelectorAll('.pdf-paper canvas').length),
    );
    observer.observe(el, { childList: true, subtree: true });
  });
  const jump = async (n: string) => {
    await page.getByLabel('页码', { exact: true }).fill(n);
    await page.getByLabel('页码', { exact: true }).press('Enter');
    await expect(paper).toHaveAttribute('data-page', n);
    await expect(paper).toHaveAttribute('aria-busy', 'false');
  };
  await jump('3');
  await jump('2');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(paper).toHaveAttribute('data-page', '4');
  await expect(paper).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.textLayer')).toContainText('Page 4 line 0');
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => page.locator('.reading-canvas').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(300);
  await expect(paper).toHaveAttribute('data-page', '4');
  const before = await paper.evaluate((el) => ({
    width: el.clientWidth,
    top: el.parentElement!.parentElement!.scrollTop,
  }));
  await page.getByLabel('文档导航', { exact: true }).click();
  await expect(page.locator('.thumbnail.selected')).toBeInViewport();
  await expect(paper).toHaveAttribute('aria-busy', 'false');
  await expect
    .poll(async () => {
      const current = await paper.evaluate((el) => ({
        width: el.clientWidth,
        top: el.parentElement!.parentElement!.scrollTop,
      }));
      return Math.abs((current.top - 16) / current.width - (before.top - 16) / before.width);
    })
    .toBeLessThan(0.02);
  await jump('1');
  await expect.poll(() => page.locator('.reading-canvas').evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => (window as any).pageFrames)).not.toContain(0);
});

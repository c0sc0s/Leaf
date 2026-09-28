import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { openReaderSettings } from './readerMenu';
async function openSpecimen(page: Page, count = 8) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.setTitle('Reliable reading specimen');
  for (let n = 1; n <= count; n++) {
    const sheet = pdf.addPage(n === 3 ? [600, 1400] : [600, 1200]);
    for (let i = 0; i < 36; i++)
      sheet.drawText(`Page ${n} line ${i}. Keep this exact reading position.`, {
        font,
        size: 14,
        x: 50,
        y: 1120 - i * 28,
      });
  }
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 文件', { exact: true }).setInputFiles({
    name: 'reliable.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Reliable reading specimen', exact: true }).click();
  await ready(page, 1);
}
async function ready(page: Page, n: number) {
  await expect(page.locator(`.pdf-paper[data-page="${n}"]`)).toHaveAttribute('aria-busy', 'false');
}
async function jump(page: Page, n: number) {
  await page.getByLabel('页码', { exact: true }).fill(String(n));
  await page.getByLabel('页码', { exact: true }).press('Enter');
  await ready(page, n);
  await expect(page.locator(`.pdf-paper[data-page="${n}"]`)).toBeInViewport();
}
async function textTop(page: Page, text: string) {
  return page
    .locator('.reading-canvas [data-start]')
    .filter({ hasText: text })
    .first()
    .evaluate((el, text) => {
      const range = document.createRange();
      const index = el.textContent!.indexOf(text);
      range.setStart(el.firstChild!, index);
      range.setEnd(el.firstChild!, index + text.length);
      return (
        range.getBoundingClientRect().top -
        el.closest('.reading-canvas')!.getBoundingClientRect().top
      );
    }, text);
}
test('renders only nearby pages of a long document and scrolls continuously across mixed page sizes', async ({
  page,
}) => {
  await openSpecimen(page, 300);
  await expect(page.getByRole('button', { name: '统一阅读', exact: true })).toHaveCount(0);
  await expect(page.locator('.document-status,.page-render-progress')).toHaveCount(0);
  await jump(page, 250);
  expect(await page.locator('.pdf-paper canvas').count()).toBeLessThan(8);
  await jump(page, 2);
  await page.locator('.reading-canvas').evaluate((el) => {
    const third = el.querySelector<HTMLElement>('.pdf-slot[data-page="3"]')!;
    el.scrollTop += third.getBoundingClientRect().top - el.getBoundingClientRect().top - 150;
  });
  await ready(page, 3);
  await expect(page.locator('.pdf-paper[data-page="2"]')).toBeInViewport();
  await expect(page.locator('.pdf-paper[data-page="3"]')).toBeInViewport();
  const box = (await page.locator('.reading-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 450);
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('3');
  await expect(page.locator('.pdf-paper[data-page="3"] .textLayer')).toContainText('Page 3 line 0');
  await page.mouse.wheel(0, -700);
  await expect(page.getByLabel('页码', { exact: true })).toHaveValue('2');
  expect(await page.locator('.pdf-paper canvas').count()).toBeLessThan(8);
});
test('restores exact position and zoom, returns from navigation and locates bookmarks and search', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await openSpecimen(page);
  await jump(page, 2);
  const target = 'Page 2 line 20.';
  await page
    .locator('.textLayer [data-start]')
    .filter({ hasText: target })
    .evaluate((el) => {
      const scroller = el.closest('.reading-canvas')!;
      scroller.scrollTop +=
        el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 75;
    });
  await page.getByLabel('放大', { exact: true }).click();
  await expect(page.locator('.zoom-label')).toHaveText('110%');
  await ready(page, 2);
  const top = await textTop(page, target);
  await page.getByLabel('添加书签', { exact: true }).click();
  await jump(page, 5);
  await page.getByLabel('返回刚才的位置', { exact: true }).click();
  await ready(page, 2);
  await expect.poll(async () => Math.abs((await textTop(page, target)) - top)).toBeLessThan(4);
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByRole('button', { name: '阅读 Reliable reading specimen', exact: true }).click();
  await ready(page, 2);
  await expect(page.locator('.zoom-label')).toHaveText('110%');
  await expect.poll(async () => Math.abs((await textTop(page, target)) - top)).toBeLessThan(4);
  await page.getByLabel('文档导航', { exact: true }).click();
  await ready(page, 2);
  await expect.poll(async () => Math.abs((await textTop(page, target)) - top)).toBeLessThan(15);
  await jump(page, 6);
  await page.getByRole('tab', { name: '文档书签', exact: true }).click();
  await page.locator('.outline-item').filter({ hasText: '第 2 页' }).click();
  await ready(page, 2);
  await expect.poll(async () => Math.abs((await textTop(page, target)) - top)).toBeLessThan(15);
  await page.getByLabel('搜索 PDF', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('Page 7 line 20.');
  await page.locator('.search-result').click();
  await ready(page, 7);
  await expect.poll(() => textTop(page, 'Page 7 line 20.')).toBeGreaterThan(0);
  expect(await textTop(page, 'Page 7 line 20.')).toBeLessThan(80);
});
test('saves notes without blur, supports undo and redo, and preserves original image colors', async ({
  page,
}) => {
  await openSpecimen(page);
  const line = page.locator('.textLayer [data-start]').filter({ hasText: 'Page 1 line 2.' });
  await line.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('写笔记', { exact: true }).click();
  const note = page.getByLabel('第 1 页批注笔记', { exact: true });
  await expect(note).toBeFocused();
  await note.fill('Saved while still editing');
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { storage } = await import('/src/lib/db.ts');
        return (await storage.annotations()).find(
          (m: { note: string }) => m.note === 'Saved while still editing',
        )?.note;
      }),
    )
    .toBe('Saved while still editing');
  await note.blur();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note).toHaveValue('');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.note-card')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(note).toHaveValue('Saved while still editing');
  await openReaderSettings(page);
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await page.getByLabel('原版颜色', { exact: true }).selectOption('original');
  await expect(page.getByText('统一阅读字体', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.pdf-paper[data-page="1"]')).not.toHaveClass(/dark-paper/);
});

test('switches desktop page layouts, restores layout on reopen and edits saved annotation styles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openSpecimen(page);
  await jump(page, 4);
  await page.getByLabel('连续滚动', { exact: true }).click();
  await expect(page.getByLabel('单页', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await ready(page, 4);
  await expect(page.locator('.pdf-paper[data-page="4"]')).toBeInViewport();
  await expect(page.locator('.pdf-paper[data-page="3"]')).not.toBeInViewport();
  await page.getByLabel('下一页', { exact: true }).click();
  await ready(page, 5);
  await expect(page.locator('.pdf-paper[data-page="5"]')).toBeInViewport();
  await page.getByLabel('双页', { exact: true }).click();
  await ready(page, 5);
  await ready(page, 6);
  await expect(page.locator('.pdf-paper[data-page="5"]')).toBeInViewport();
  await expect(page.locator('.pdf-paper[data-page="6"]')).toBeInViewport();
  const a = (await page.locator('.pdf-paper[data-page="5"]').boundingBox())!;
  const b = (await page.locator('.pdf-paper[data-page="6"]').boundingBox())!;
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  await page.getByLabel('下一页', { exact: true }).click();
  await ready(page, 7);
  await ready(page, 8);
  await expect(page.locator('.pdf-paper[data-page="7"]')).toBeInViewport();
  await page.getByLabel('放大', { exact: true }).click();
  await ready(page, 7);
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByRole('button', { name: '阅读 Reliable reading specimen', exact: true }).click();
  await expect(page.getByLabel('双页', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('连续滚动', { exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('.zoom-label')).toHaveText('110%');
  await ready(page, 7);
  await expect(page.locator('.pdf-paper[data-page="8"]')).toBeInViewport();
  const line = page.locator('.textLayer [data-start]').filter({ hasText: 'Page 7 line 2.' });
  await line.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('写笔记', { exact: true }).click();
  const card = page.locator('.note-card');
  await card.getByRole('button', { name: '编辑批注', exact: true }).click();
  await card.getByRole('button', { name: '绿色', exact: true }).click();
  await card.getByRole('button', { name: '划线', exact: true }).click();
  await expect(page.locator('.annotation-overlay line')).toHaveAttribute('stroke', '#72b49a');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card.getByRole('button', { name: '高光', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card.getByRole('button', { name: '绿色', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

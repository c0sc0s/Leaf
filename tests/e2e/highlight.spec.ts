import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { switchReaderToDark } from './readerMenu';

test('composites overlapping highlight rectangles at one consistent opacity in both themes', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Highlight overlap specimen');
  pdf.addPage([400, 500]);
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'overlap.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.evaluate(async () => {
    const { StorageClient } = await import('/src/platform/transport/storage.ts');
    const storage = new StorageClient();
    const book = (await storage.request('library.list', undefined)).find(
      (b: { title: string }) => b.title === 'Highlight overlap specimen',
    )!;
    await storage.request('annotations.commit', {
      documentId: book.id,
      remove: [],
      put: [
        {
          id: 'overlap',
          documentId: book.id,
          targets: [
            {
              documentId: book.id,
              revision: book.revision,
              schema: 'leaf.pdf',
              version: 1,
              payload: {
                page: 1,
                offset: 0,
                end: 0,
                rects: [
                  [100, 300, 200, 330],
                  [100, 320, 200, 350],
                  [100, 350, 200, 380],
                ],
              },
            },
          ],
          quote: 'Highlight',
          kind: 'highlight',
          color: 'blue',
          note: '',
          createdAt: 0,
        },
      ],
    });
  });
  await page.getByRole('button', { name: '阅读 Highlight overlap specimen', exact: true }).click();
  const paper = page.locator('.pdf-paper[data-page="1"]');
  await expect(paper).toHaveAttribute('aria-busy', 'false');
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await switchReaderToDark(page);
    const image = await sharp(await paper.screenshot())
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const scale = image.info.width / 400;
    const pixel = (pdfY: number) => {
      const x = Math.round(150 * scale),
        y = Math.round((500 - pdfY) * scale);
      return [
        ...image.data.subarray((y * image.info.width + x) * 3, (y * image.info.width + x) * 3 + 3),
      ];
    };
    // GPU compositing can round channels differently across macOS and Windows.
    const baseline = pixel(310);
    for (const [position, label] of [
      [325, 'overlapping area'],
      [365, 'final line'],
    ] as const) {
      const differences = pixel(position).map((channel, index) =>
        Math.abs(channel - baseline[index]),
      );
      expect(Math.max(...differences), `${theme} ${label}`).toBeLessThanOrEqual(2);
    }
  }
});

test('copies the actual selected text and creates precise multi-line highlight rectangles', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  pdf.setTitle('Selection specimen');
  const sheet = pdf.addPage([500, 600]);
  for (let i = 0; i < 4; i++)
    sheet.drawText(`Line ${i}: Wide WWW and narrow iii, selected accurately.`, {
      font,
      size: 18,
      x: 35,
      y: 520 - i * 22,
    });
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'selection.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Selection specimen', exact: true }).click();
  await expect(page.locator('.pdf-paper')).toHaveAttribute('aria-busy', 'false');
  const selected = await page.locator('.textLayer').evaluate((root) => {
    const lines = root.querySelectorAll('[data-start]');
    const range = document.createRange();
    range.setStart(lines[0].firstChild!, 8);
    range.setEnd(lines[2].firstChild!, 25);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return {
      text: getSelection()!.toString(),
      widths: [
        ...new Map(
          [...range.getClientRects()]
            .filter((r) => r.width > 1)
            .map((r) => [`${r.x}:${r.y}:${r.width}:${r.height}`, r.width]),
        ).values(),
      ],
    };
  });
  await page.getByLabel('复制文字', { exact: true }).click();
  // Windows clipboard APIs normalize line endings to CRLF.
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.replace(/\r\n/g, '\n')).toBe(selected.text.replace(/\r\n/g, '\n'));
  await page.getByLabel('高光标注', { exact: true }).click();
  await expect(page.locator('.annotation-overlay [data-mark-id] rect')).toHaveCount(3);
  const widths = await page
    .locator('.annotation-overlay [data-mark-id] rect')
    .evaluateAll((rects) => rects.map((el) => Number(el.getAttribute('width'))));
  expect(widths.map(Math.round)).toEqual([...new Set(selected.widths.map(Math.round))]);
});

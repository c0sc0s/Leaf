import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { switchReaderToDark } from './readerMenu';

test('composites overlapping legacy highlight rectangles at one consistent opacity in both themes', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Highlight overlap specimen');
  pdf.addPage([400, 500]);
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'overlap.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await expect(page.locator('.book-card')).toHaveCount(9);
  await page.evaluate(async () => {
    const { storage } = await import('/src/lib/db.ts');
    const book = (await storage.books()).find(
      (b: { title: string }) => b.title === 'Highlight overlap specimen',
    )!;
    await storage.putAnnotation({
      id: 'overlap',
      bookId: book.id,
      page: 1,
      start: 0,
      end: 0,
      quote: 'Legacy highlight',
      kind: 'highlight',
      color: 'blue',
      note: '',
      createdAt: 0,
      source: 'text',
      rects: [
        [100, 300, 200, 330],
        [100, 320, 200, 350],
        [100, 350, 200, 380],
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
    expect(pixel(325), `${theme} overlapping area`).toEqual(pixel(310));
    expect(pixel(365), `${theme} final line`).toEqual(pixel(310));
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
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
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

test('removes obsolete content cache on upgrade while preserving the library and annotations', async ({
  page,
}) => {
  await page.route('http://127.0.0.1:5173/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  );
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('folio-library', 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('books', { keyPath: 'id' });
        const marks = db.createObjectStore('annotations', { keyPath: 'id' });
        marks.createIndex('bookId', 'bookId');
        db.createObjectStore('ocr', { keyPath: 'id' });
        db.createObjectStore('documents', { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['books', 'annotations', 'documents'], 'readwrite');
        tx.objectStore('books').put({
          id: 'legacy',
          title: 'Existing library',
          filename: 'legacy.pdf',
          author: 'Reader',
          blob: new Blob(),
          cover: '',
          pages: 10,
          page: 4,
          bookmarks: [4],
          category: '未分类',
          addedAt: 0,
          openedAt: 0,
        });
        tx.objectStore('annotations').put({
          id: 'saved-note',
          bookId: 'legacy',
          note: 'Keep my note',
          page: 4,
          quote: 'Keep text',
          createdAt: 0,
        });
        tx.objectStore('documents').put({ id: 'legacy', content: { pages: ['obsolete'] } });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.unroute('http://127.0.0.1:5173/');
  await page.reload();
  await expect(
    page.getByRole('button', { name: '阅读 Existing library', exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { storage } = await import('/src/lib/db.ts');
    const stores = await new Promise<string[]>((resolve) => {
      const r = indexedDB.open('folio-library');
      r.onsuccess = () => {
        resolve([...r.result.objectStoreNames]);
        r.result.close();
      };
    });
    return { books: await storage.books(), notes: await storage.annotations(), stores };
  });
  expect(saved.stores).not.toContain('documents');
  expect(saved.books[0].bookmarks).toEqual([4]);
  expect(saved.notes[0].note).toBe('Keep my note');
});

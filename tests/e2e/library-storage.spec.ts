import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('migrates legacy PDF and Markdown content, then updates metadata without rewriting bytes', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Legacy PDF');
  pdf.addPage([400, 500]);
  pdf.addPage([400, 500]);
  const bytes = [...(await pdf.save())];
  const image =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="green"/></svg>';
  await page.route('http://127.0.0.1:5173/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  );
  await page.goto('/');
  await page.evaluate(
    async ({ bytes, image }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('folio-library', 4);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('books', { keyPath: 'id' });
          db.createObjectStore('annotations', { keyPath: 'id' }).createIndex('bookId', 'bookId');
          db.createObjectStore('ocr', { keyPath: 'id' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['books', 'annotations', 'ocr'], 'readwrite');
          const metadata = {
            author: 'Reader',
            cover: '',
            pages: 2,
            page: 2,
            addedAt: 1,
            openedAt: 2,
            favorite: false,
            bookmarks: [2],
            bookmarkLocations: { 2: { page: 2, ratio: 0.4 } },
          };
          tx.objectStore('books').put({
            ...metadata,
            id: 'legacy-pdf',
            title: 'Legacy PDF',
            filename: 'legacy.pdf',
            blob: new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          });
          tx.objectStore('books').put({
            ...metadata,
            id: 'legacy-md',
            format: 'markdown',
            title: 'Legacy Markdown',
            filename: 'Legacy Markdown',
            blob: new Blob(['markdown source']),
            chapters: [
              { path: 'README.md', title: 'Introduction', content: '# Introduction' },
              {
                path: '2.md',
                title: 'Saved chapter',
                content: '# Saved chapter\n\n![Saved image](image.svg)',
              },
            ],
            assets: [{ path: 'image.svg', blob: new Blob([image], { type: 'image/svg+xml' }) }],
          });
          tx.objectStore('annotations').put({
            id: 'saved-note',
            bookId: 'legacy-pdf',
            page: 2,
            start: 0,
            end: 4,
            quote: 'Text',
            note: 'Keep my note',
            kind: 'highlight',
            color: 'amber',
            rects: [],
            createdAt: 2,
            source: 'text',
          });
          tx.objectStore('ocr').put({ id: 'legacy-pdf:2', text: 'OCR cache' });
          tx.objectStore('ocr').put({ id: 'other-book:1', text: 'Other cache' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
      localStorage.setItem('folio-initialized', '1');
      for (const id of ['legacy-pdf', 'legacy-md'])
        localStorage.setItem(
          `folio-position:${id}`,
          JSON.stringify({
            page: 2,
            ratio: 0,
            zoom: 1.2,
            layout: { continuous: true, spread: false },
          }),
        );
    },
    { bytes, image },
  );
  await page.unroute('http://127.0.0.1:5173/');
  await page.reload();
  await expect(page.locator('.book-card')).toHaveCount(2);
  const migrated = await page.evaluate(async () => {
    const { storage } = await import('/src/lib/db.ts');
    const pdf = (await storage.book('legacy-pdf'))!;
    const md = (await storage.book('legacy-md'))!;
    return {
      metadata: await storage.books(),
      pdfBytes: [...new Uint8Array(await pdf.blob.arrayBuffer())],
      mdSource: await md.blob.text(),
      chapters: md.chapters,
      asset: await md.assets![0].blob.text(),
      notes: await storage.annotations('legacy-pdf'),
      counts: await storage.annotationCounts(),
    };
  });
  for (const metadata of migrated.metadata) {
    expect(metadata).not.toHaveProperty('blob');
    expect(metadata).not.toHaveProperty('chapters');
    expect(metadata).not.toHaveProperty('assets');
    expect(metadata).toMatchObject({
      page: 2,
      bookmarks: [2],
      bookmarkLocations: { 2: { page: 2, ratio: 0.4 } },
    });
  }
  expect(migrated.pdfBytes).toEqual(bytes);
  expect(migrated.mdSource).toBe('markdown source');
  expect(migrated.chapters![1].content).toContain('# Saved chapter');
  expect(migrated.asset).toBe(image);
  expect(migrated.notes[0].note).toBe('Keep my note');
  expect(migrated.counts).toEqual({ 'legacy-pdf': 1 });
  await page.getByRole('button', { name: '阅读 Legacy PDF', exact: true }).click();
  await expect(page.locator('.pdf-paper[data-page="2"]')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByRole('button', { name: '阅读 Legacy Markdown', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Saved chapter');
  await expect(page.locator('.markdown-content')).toHaveCSS('font-size', '21.6px');
  await expect(page.getByLabel('移除书签', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.markdown-content img').evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(200);
  await page.getByLabel('上一章', { exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Introduction');
  await page.getByLabel('阅读偏好', { exact: true }).click();
  await page.getByRole('dialog').press('ArrowRight');
  await expect(page.locator('.markdown-status')).toContainText('第 1 / 2 章');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.markdown-content h1')).toHaveText('Saved chapter');
  await page.getByLabel('返回书架', { exact: true }).click();

  const updated = await page.evaluate(async () => {
    const { storage } = await import('/src/lib/db.ts');
    const metadata = (await storage.metadata('legacy-md'))!;
    const original = IDBObjectStore.prototype.put;
    const writes: string[] = [];
    IDBObjectStore.prototype.put = function (...args) {
      writes.push(this.name);
      return original.apply(this, args);
    };
    try {
      await storage.updateBook({ ...metadata, favorite: true, page: 1 });
    } finally {
      IDBObjectStore.prototype.put = original;
    }
    const book = (await storage.book('legacy-md'))!;
    return {
      writes,
      metadata: await storage.metadata('legacy-md'),
      source: await book.blob.text(),
      asset: await book.assets![0].blob.text(),
    };
  });
  expect(updated.writes).toEqual(['books']);
  expect(updated.metadata).toMatchObject({ favorite: true, page: 1, bookmarks: [2] });
  expect(updated.source).toBe('markdown source');
  expect(updated.asset).toBe(image);

  const removed = await page.evaluate(async () => {
    const { storage } = await import('/src/lib/db.ts');
    const metadata = (await storage.metadata('legacy-pdf'))!;
    await storage.deleteBook('legacy-pdf');
    // A delayed progress write must not recreate a deleted book.
    await storage.updateBook(metadata);
    const raw = await new Promise<{ content: unknown; ocrKeys: IDBValidKey[]; version: number }>(
      (resolve, reject) => {
        const request = indexedDB.open('folio-library');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['bookContents', 'ocr']);
          const content = tx.objectStore('bookContents').get('legacy-pdf');
          const ocr = tx.objectStore('ocr').getAllKeys();
          tx.oncomplete = () => {
            resolve({ content: content.result ?? null, ocrKeys: ocr.result, version: db.version });
            db.close();
          };
        };
      },
    );
    return {
      ...raw,
      book: await storage.book('legacy-pdf'),
      notes: await storage.annotations('legacy-pdf'),
      position: localStorage.getItem('folio-position:legacy-pdf'),
    };
  });
  expect(removed).toEqual({
    content: null,
    ocrKeys: ['other-book:1'],
    version: 5,
    book: null,
    notes: [],
    position: null,
  });
});

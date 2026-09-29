import { test, expect } from '@playwright/test';
import type { Annotation, Book } from '../../src/types';

const cases = [
  ['duplicate', true],
  ['preferences-only', true],
  ['new-book', false],
  ['body', false],
  ['chapter', false],
  ['asset', false],
  ['new-note', false],
  ['changed-note', false],
] as const;

for (const [change, canOpen] of cases) {
  test(`preserves both libraries after a committed migration with ${change}`, async ({ page }) => {
    await page.route('http://127.0.0.1:5173/', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
    );
    await page.goto('/');
    const receipt = await page.evaluate(async (change) => {
      const { storage } = await import('/src/lib/db.ts');
      const { storageRequest } = await import('/src/lib/storageClient.ts');
      const { migrateLegacyStorage } = await import('/src/lib/legacyMigration.ts');
      const metadata = {
        author: '',
        filename: 'legacy.md',
        pages: 1,
        page: 1,
        cover: '',
        favorite: false,
        addedAt: 1,
        openedAt: 1,
      };
      const books: Book[] = [
        {
          ...metadata,
          id: 'legacy-book',
          title: 'Legacy book',
          format: 'markdown',
          blob: new Blob(['Original source'], { type: 'text/markdown' }),
          chapters: [{ path: 'README.md', title: 'Chapter', content: '# Original chapter' }],
          assets: [
            { path: 'image.svg', blob: new Blob(['Original image'], { type: 'image/svg+xml' }) },
          ],
        },
      ];
      const marks: Annotation[] = [
        {
          id: 'legacy-note',
          bookId: 'legacy-book',
          page: 1,
          start: 0,
          end: 4,
          quote: 'Text',
          note: 'Saved note',
          kind: 'highlight',
          color: 'amber',
          rects: [],
          createdAt: 1,
          source: 'text',
        },
      ];
      const seed = async () => {
        await new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open('folio-library', 4);
          opening.onupgradeneeded = () => {
            for (const name of ['books', 'annotations', 'ocr'])
              opening.result.createObjectStore(name, { keyPath: 'id' });
          };
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const db = opening.result;
            const tx = db.transaction(['books', 'annotations'], 'readwrite');
            for (const book of books) tx.objectStore('books').put(book);
            for (const mark of marks) tx.objectStore('annotations').put(mark);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
        localStorage.setItem('folio-initialized', '1');
        localStorage.setItem('folio-settings', JSON.stringify({ theme: 'light' }));
      };
      await seed();
      await migrateLegacyStorage();
      const receipt = await storageRequest<string>('legacyReceipt', location.origin);
      await storage.updateBook({ ...books[0], favorite: true, openedAt: 100, bookmarks: [1] });
      await storage.putBook({
        ...metadata,
        id: 'new-book',
        title: 'New book',
        format: 'markdown',
        blob: new Blob(['New book content']),
      });
      await storage.putAnnotation({ ...marks[0], id: 'new-target-note', note: 'New target note' });
      await storageRequest('setPreference', {
        key: 'folio-settings',
        value: JSON.stringify({ theme: 'dark' }),
      });
      books[0].addedAt = 200;
      if (change === 'new-book') books.push({ ...books[0], id: 'unmigrated-book' });
      if (change === 'body') books[0].blob = new Blob(['Changed source']);
      if (change === 'chapter') books[0].chapters![0].content = '# Changed chapter';
      if (change === 'asset') books[0].assets![0].blob = new Blob(['Changed image']);
      if (change === 'new-note') marks.push({ ...marks[0], id: 'unmigrated-note' });
      if (change === 'changed-note') marks[0].note = 'Changed legacy note';
      if (change === 'preferences-only') {
        localStorage.setItem('folio-settings', JSON.stringify({ theme: 'light' }));
      } else {
        await seed();
      }
      return receipt;
    }, change);
    await page.unroute('http://127.0.0.1:5173/');
    await page.reload();
    if (canOpen) {
      await expect(page.locator('.book-card')).toHaveCount(2);
      await expect(page.getByRole('status')).toContainText('旧数据已保留');
      await expect(page.locator('html')).toHaveClass(/dark/);
    } else {
      await expect(page.getByRole('heading', { name: '无法打开书库' })).toBeVisible();
    }
    const retained = await page.evaluate(async () => {
      const { storage } = await import('/src/lib/db.ts');
      const { storageRequest } = await import('/src/lib/storageClient.ts');
      return {
        receipt: await storageRequest('legacyReceipt', location.origin),
        legacy: (await indexedDB.databases()).some((db) => db.name === 'folio-library'),
        oldSettings: localStorage.getItem('folio-settings'),
        metadata: await storage.metadata('legacy-book'),
        content: await (await storage.book('legacy-book'))!.blob.text(),
        newContent: await (await storage.book('new-book'))!.blob.text(),
        notes: (await storage.annotations()).map((mark) => mark.note).sort(),
      };
    });
    expect(retained).toMatchObject({
      receipt,
      legacy: change !== 'preferences-only',
      oldSettings: '{"theme":"light"}',
      metadata: { favorite: true, openedAt: 100, bookmarks: [1] },
      content: 'Original source',
      newContent: 'New book content',
      notes: ['New target note', 'Saved note'],
    });
    if (canOpen) {
      await page.reload();
      await expect(page.locator('.book-card')).toHaveCount(2);
    }
  });
}

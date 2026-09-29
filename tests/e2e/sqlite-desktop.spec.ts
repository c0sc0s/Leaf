import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('desktop flushes SQLite on close and reopens the same library', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-sqlite-desktop-'));
  const profile = path.join(root, 'profile');
  const file = path.join(root, 'persist.md');
  await writeFile(file, '# Persistent book\n\nRemember this passage.');
  const launch = () =>
    electron.launch({
      args: ['electron/main.cjs', '--dev'],
      env: { ...process.env, LEAF_USER_DATA: profile },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await expect(page.locator('.book-card')).toHaveCount(8);
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await page.getByRole('button', { name: '导入文件', exact: true }).click();
    await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
    await expect(page.locator('.book-card')).toHaveCount(9);
    const id = await page.evaluate(async () => {
      const { storage } = await import('/src/lib/db.ts');
      const book = (await storage.books()).find(
        (book: { title: string }) => book.title === 'Persistent book',
      )!;
      await storage.putAnnotation({
        id: 'durable-note',
        bookId: book.id,
        page: 1,
        start: 0,
        end: 10,
        quote: 'Persistent',
        note: 'Saved before close',
        kind: 'highlight',
        color: 'amber',
        rects: [],
        createdAt: 1,
        source: 'text',
      });
      return book.id;
    });
    await page.getByRole('button', { name: '阅读 Persistent book', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Persistent book');
    await page.getByLabel('阅读笔记', { exact: true }).click();
    await page.getByLabel('第 1 章批注笔记').fill('Last keystroke before closing');
    const closed = app.waitForEvent('close');
    await page.evaluate(async () => {
      const { rememberPreference } = await import('/src/lib/preferences.ts');
      rememberPreference('folio-mark-color', 'pink');
      window.desktop!.closeWindow();
    });
    await closed;
    const db = new DatabaseSync(path.join(profile, 'library', 'library.sqlite'), {
      readOnly: true,
    });
    try {
      expect(db.prepare('SELECT note FROM annotations WHERE id=?').get('durable-note')!.note).toBe(
        'Last keystroke before closing',
      );
      expect(
        db.prepare('SELECT value FROM preferences WHERE key=?').get('folio-mark-color')!.value,
      ).toBe('pink');
      expect(db.prepare('SELECT state FROM reading_states WHERE book_id=?').get(id)).toBeTruthy();
      expect(db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
      const content = db.prepare('SELECT hash FROM book_contents WHERE book_id=?').get(id)!;
      expect(
        await readFile(path.join(profile, 'library', 'content', content.hash as string), 'utf8'),
      ).toContain('Remember this passage.');
    } finally {
      db.close();
    }
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('.book-card')).toHaveCount(9);
    await page.getByRole('button', { name: '阅读 Persistent book', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Persistent book');
    expect(
      await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
    ).not.toContain('folio-library');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

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
      args: ['.', '--dev'],
      env: { ...process.env, LEAF_TEST_PLUGINS: 'all', LEAF_USER_DATA: profile },
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
      const { StorageClient } = await import('/src/platform/transport/storage.ts');
      const storage = new StorageClient();
      const book = (await storage.request('library.list', undefined)).find(
        (book: { title: string }) => book.title === 'Persistent book',
      )!;
      await storage.request('annotations.commit', {
        documentId: book.id,
        remove: [],
        put: [
          {
            id: 'durable-note',
            documentId: book.id,
            targets: [
              {
                documentId: book.id,
                revision: book.revision,
                schema: 'leaf.markdown',
                version: 1,
                payload: { path: 'document.md', offset: 0, end: 10 },
              },
            ],
            quote: 'Persistent',
            note: 'Saved before close',
            kind: 'highlight',
            color: 'amber',
            createdAt: 1,
          },
        ],
      });
      return book.id;
    });
    await page.getByRole('button', { name: '阅读 Persistent book', exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Persistent book');
    await page.getByLabel('阅读笔记', { exact: true }).click();
    await page.getByLabel('第 1 章批注笔记').fill('Last keystroke before closing');
    const closed = app.waitForEvent('close');
    await page.evaluate(async () => {
      await window.desktop!.storage.request('settings.set', {
        key: 'annotation.color',
        value: 'pink',
      });
      window.desktop!.closeWindow();
    });
    await closed;
    const db = new DatabaseSync(path.join(profile, 'reader', 'storage', 'library.sqlite'), {
      readOnly: true,
    });
    try {
      expect(
        db
          .prepare("SELECT json_extract(value,'$.note') AS note FROM annotations WHERE id=?")
          .get('durable-note')!.note,
      ).toBe('Last keystroke before closing');
      expect(
        db.prepare('SELECT value FROM settings WHERE key=?').get('annotation.color')!.value,
      ).toBe('"pink"');
      expect(
        db.prepare('SELECT value FROM reading_positions WHERE document_id=?').get(id),
      ).toBeTruthy();
      expect(db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
      const content = db
        .prepare('SELECT hash FROM document_resources WHERE document_id=?')
        .get(id)!;
      expect(
        await readFile(
          path.join(profile, 'reader', 'storage', 'content', content.hash as string),
          'utf8',
        ),
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
    ).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

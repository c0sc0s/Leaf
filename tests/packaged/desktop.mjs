import { _electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { PDFDocument, PDFName } from 'pdf-lib';
const root = process.cwd();
const samples = path.join(root, 'tests/fixtures/samples');
const sampleFiles = JSON.parse(await readFile(path.join(samples, 'manifest.json'), 'utf8')).map(
  ({ slug }) => path.join(samples, `${slug}.pdf`),
);
const userData = await mkdtemp(path.join(os.tmpdir(), 'leaf-desktop-test-'));
const executable =
  process.env.LEAF_EXECUTABLE ||
  (process.platform === 'darwin'
    ? path.join(
        root,
        process.arch === 'arm64'
          ? 'release/mac-arm64/Leaf.app/Contents/MacOS/Leaf'
          : 'release/mac/Leaf.app/Contents/MacOS/Leaf',
      )
    : path.join(root, 'release/win-unpacked/Leaf.exe'));
await mkdir('test-results/desktop', { recursive: true });
const app = await _electron.launch({
  executablePath: executable,
  // Windows CI needs a live native compositor when backdrop changes precede screenshots.
  env: {
    LEAF_HIDDEN_WINDOW: process.env.CI && process.platform === 'win32' ? '0' : '1',
    ...process.env,
    LEAF_USER_DATA: userData,
  },
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const importMenu = page.locator('.import-trigger');
  await expect(importMenu).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.book-card')).toHaveCount(0);
  await app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
  }, sampleFiles);
  await importMenu.click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await expect(page.locator('.book-card')).toHaveCount(8, { timeout: 30000 });
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return {
      sandbox: p.sandbox,
      contextIsolation: p.contextIsolation,
      nodeIntegration: p.nodeIntegration,
    };
  });
  expect(prefs).toEqual({ sandbox: true, contextIsolation: true, nodeIntegration: false });
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/library-light.png' });
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await page.getByLabel('位置序号', { exact: true }).fill('2');
  await page.getByLabel('位置序号', { exact: true }).press('Enter');
  await expect(
    page.locator('.textLayer [data-start]').filter({ hasText: 'We move' }),
  ).toBeVisible();
  const body = page.locator('.textLayer [data-start]').filter({ hasText: 'We move' });
  await expect(page.locator('.pdf-paper[data-page="2"]')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => document.fonts.ready);
  await body.click({ trial: true });
  await body.evaluate((el) => {
    const range = document.createRange();
    range.setStart(el.firstChild, 0);
    range.setEnd(el.firstChild, 60);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('高光标注', { exact: true }).click();
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await page.getByLabel('第 2 页批注笔记').fill('Keep this idea.');
  await page.getByLabel('第 2 页批注笔记').press('Tab');
  const output = path.join(userData, 'annotated.pdf');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已导出');
  const exported = await PDFDocument.load(await readFile(output));
  expect(exported.getPage(1).node.get(PDFName.of('Annots'))).toBeTruthy();
  await page.getByLabel('关闭通知', { exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/reader-light.png' });
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读偏好', exact: true }).click();
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('.reading-surface')).toHaveClass(/reader-dark/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.note-card textarea')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/reader-dark.png' });
  await page.getByLabel('关闭笔记', { exact: true }).click();
  await page.locator('.reading-canvas').evaluate((el) => {
    const next = el.querySelector('.pdf-slot[data-page="3"]');
    el.scrollTop +=
      next.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientHeight / 2;
  });
  await expect(page.locator('.pdf-paper[data-page="3"]')).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/desktop/reader-continuous.png',
  });
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '阅读偏好', exact: true }).click();
  await page.screenshot({
    animations: 'disabled',
    path: 'test-results/desktop/reader-settings.png',
  });
  await page.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByLabel('返回书架', { exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: 'test-results/desktop/library-dark.png' });
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    },
    path.join(samples, 'quiet-spaces.pdf'),
  );
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await expect(page.getByRole('status')).toContainText('已在书库中');
  const sharp = (await import('sharp')).default;
  const image = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="450"><rect width="1200" height="450" fill="white"/><text x="70" y="160" fill="black" font-family="Arial" font-size="50">Reading is a quiet adventure.</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  const scan = await PDFDocument.create();
  scan.setTitle('Offline scanned page');
  const scanImage = await scan.embedPng(image);
  scan.addPage([600, 225]).drawImage(scanImage, { x: 0, y: 0, width: 600, height: 225 });
  const scanFile = path.join(userData, 'scan.pdf');
  await writeFile(scanFile, await scan.save());
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, scanFile);
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await page.getByRole('button', { name: '阅读 Offline scanned page', exact: true }).click();
  await expect(page.locator('.pdf-paper canvas').first()).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'Packaged desktop checks passed: PDF rendering, sandbox, native open/save, annotations, continuous scrolling and themes.',
  );
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}

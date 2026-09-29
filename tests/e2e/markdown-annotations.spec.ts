import { test, expect, type Page } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const markdown =
  '# Selection specimen\n\nRead **bold text** and plain words.\n\nAnother paragraph for keyboard selection.\n\n```python\nprint("hello")\n```';
async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'selection.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(markdown),
  });
  await page.getByRole('button', { name: '阅读 Selection specimen', exact: true }).click();
}

test('selects formatted Markdown, saves underline and notes, edits style, and restores after reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await page
    .locator('.markdown-content p')
    .first()
    .evaluate((element) => {
      const spans = element.querySelectorAll('[data-md-start]');
      const range = document.createRange();
      range.setStart(spans[0].firstChild!, 0);
      const end = spans[spans.length - 1].firstChild!;
      range.setEnd(end, end.textContent!.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
  await expect(page.getByRole('toolbar', { name: '选中文字操作', exact: true })).toBeVisible();
  await page.getByLabel('划线标注', { exact: true }).click();
  const mark = page.locator('.markdown-annotation');
  await expect(mark.first()).toHaveAttribute('data-kind', 'underline');
  expect(await mark.allTextContents()).toEqual(['Read ', 'bold text', ' and plain words.']);
  const id = (await mark.first().getAttribute('data-mark-id'))!;
  await mark.first().click();
  await page
    .getByRole('toolbar', { name: '编辑批注', exact: true })
    .getByLabel('编辑这条笔记', { exact: true })
    .click();
  const card = page.locator(`[data-mark-card="${id}"]`);
  const note = card.getByRole('textbox');
  await expect(note).toBeFocused();
  await note.fill('Remember this paragraph.');
  await card.getByLabel('编辑批注', { exact: true }).click();
  await expect(card.getByLabel('划线', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await card.getByLabel('高光', { exact: true }).click();
  await expect(mark.first()).toHaveAttribute('data-kind', 'highlight');
  await card.getByLabel('粉色', { exact: true }).click();
  await expect(mark.first()).toHaveCSS('--annotation-color', '#d994ad');
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const { storage } = await import('/src/lib/db.ts');
        return (await storage.annotations()).find((entry: { id: string }) => entry.id === id)?.note;
      }, id),
    )
    .toBe('Remember this paragraph.');
  await page.getByLabel('返回书架', { exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '阅读 Selection specimen', exact: true }).click();
  await expect(mark.first()).toHaveAttribute('data-kind', 'highlight');
  await page.getByLabel('阅读笔记', { exact: true }).click();
  await expect(note).toHaveValue('Remember this paragraph.');
  await card.getByLabel('删除这条批注', { exact: true }).click();
  await expect(mark).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(mark.first()).toHaveAttribute('data-kind', 'highlight');
  expect(errors).toEqual([]);
});

test('opens tools after a real mouse drag and supports code selection without changing copied code', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const prose = page.locator('.markdown-content p').first();
  const box = (await prose.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('toolbar', { name: '选中文字操作', exact: true })).toBeVisible();
  await page.getByLabel('高光标注', { exact: true }).click();
  await expect(page.locator('.markdown-annotation').first()).toHaveAttribute(
    'data-kind',
    'highlight',
  );
  await page.locator('.markdown-content code').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('划线标注', { exact: true }).click();
  await expect(page.locator('code .markdown-annotation').first()).toHaveAttribute(
    'data-kind',
    'underline',
  );
  await page.getByLabel('复制代码', { exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(
    'print("hello")\n',
  );
  await expect(page.locator('code .hljs-string')).toHaveText('"hello"');
});

test('keeps annotations scoped to chapters and opens notes from focus mode', async ({ page }) => {
  const root = await mkdtemp(path.join(tmpdir(), 'leaf-markdown-notes-'));
  try {
    await writeFile(path.join(root, '1.md'), '# First\n\nSame sentence to annotate.');
    await writeFile(path.join(root, '2.md'), '# Second\n\nSame sentence to annotate.');
    await page.goto('/');
    await expect(page.locator('.book-card')).toHaveCount(8);
    await page.getByLabel('选择 Markdown 文件夹', { exact: true }).setInputFiles(root);
    await page.getByRole('button', { name: `阅读 ${path.basename(root)}`, exact: true }).click();
    await page.getByLabel('专注阅读（F）', { exact: true }).click();
    await page.locator('.markdown-content p').evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page.getByLabel('写笔记', { exact: true }).click();
    await expect(page.locator('.markdown-reader')).not.toHaveClass(/reader-focus/);
    const note = page.getByLabel('第 1 章批注笔记', { exact: true });
    await expect(note).toBeFocused();
    await note.fill('Only chapter one.');
    await page.getByLabel('下一章', { exact: true }).click();
    await expect(page.locator('.markdown-content h1')).toHaveText('Second');
    await expect(page.locator('.markdown-annotation')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: '选中文字操作', exact: true })).toHaveCount(0);
    await page.getByLabel('上一章', { exact: true }).click();
    await expect(page.locator('.markdown-annotation')).toContainText('Same sentence to annotate.');
    await page.getByLabel('搜索 Markdown', { exact: true }).click();
    await page.getByLabel('搜索 Markdown 内容', { exact: true }).fill('sentence');
    await expect(page.locator('.markdown-annotation')).toHaveCount(3);
    await expect(page.locator('.markdown-content mark')).toHaveText('sentence');
    await page.getByLabel('放大', { exact: true }).click();
    await expect(page.locator('.markdown-annotation').first()).toHaveAttribute(
      'data-kind',
      'highlight',
    );
    await expect(note).toHaveValue('Only chapter one.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import { test, expect } from '@playwright/test';

for (const initialKind of ['underline', 'highlight'] as const) {
  test(`edits an existing ${initialKind}, preserves its note and persists type changes`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
    await page.getByLabel('位置序号', { exact: true }).fill('2');
    await page.getByLabel('位置序号', { exact: true }).press('Enter');
    const text = page.locator('.textLayer [data-start]').filter({ hasText: 'We move' });
    await expect(page.locator('.pdf-paper[data-page="2"]')).toHaveAttribute('aria-busy', 'false');
    await expect(text).toBeVisible();
    // Let navigation and scrolling settle before creating the selection toolbar.
    await text.click({ trial: true });
    await text.evaluate((element) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, 40);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await page
      .getByRole('button', {
        name: initialKind === 'underline' ? '划线标注' : '高光标注',
        exact: true,
      })
      .click();
    const overlay = page.locator('.annotation-overlay [data-mark-id]');
    await expect(overlay).toHaveAttribute('data-kind', initialKind);
    const markId = (await overlay.getAttribute('data-mark-id'))!;
    await overlay.scrollIntoViewIfNeeded();
    const box = (await overlay.boundingBox())!;
    await page.mouse.click(
      box.x + 20,
      initialKind === 'underline' ? box.y - 3 : box.y + box.height / 2,
    );
    await page
      .getByRole('toolbar', { name: '编辑批注', exact: true })
      .getByRole('button', { name: '编辑这条笔记', exact: true })
      .click();
    const card = page.locator(`[data-mark-card="${markId}"]`);
    const note = card.getByRole('textbox');
    await expect(note).toBeFocused();
    await note.fill('Keep this note when changing the annotation type.');
    await card.getByRole('button', { name: '编辑批注', exact: true }).click();
    const highlight = card.getByRole('button', { name: '高光', exact: true });
    const underline = card.getByRole('button', { name: '划线', exact: true });
    await expect(initialKind === 'underline' ? underline : highlight).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const savedKind = () =>
      page.evaluate(async (id) => {
        const { StorageClient } = await import('/src/platform/transport/storage.ts');
        const storage = new StorageClient();
        const documents = await storage.request('library.list', undefined);
        const saved = (
          await Promise.all(
            documents.map((document) => storage.request('annotations.list', document.id)),
          )
        ).flat();
        return saved.find((mark: { id: string }) => mark.id === id)?.kind;
      }, markId);
    for (const kind of ['highlight', 'underline'] as const) {
      await (kind === 'highlight' ? highlight : underline).click();
      await expect(overlay).toHaveAttribute('data-kind', kind);
      await expect(kind === 'highlight' ? highlight : underline).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(kind === 'highlight' ? underline : highlight).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect.poll(savedKind).toBe(kind);
      await expect(note).toHaveValue('Keep this note when changing the annotation type.');
    }
    await page.getByRole('button', { name: '返回书架', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
    await page.getByRole('button', { name: '阅读笔记', exact: true }).click();
    await expect(card.getByRole('textbox')).toHaveValue(
      'Keep this note when changing the annotation type.',
    );
    await card.getByRole('button', { name: '编辑批注', exact: true }).click();
    await expect(underline).toHaveAttribute('aria-pressed', 'true');
    await expect(overlay).toHaveAttribute('data-kind', 'underline');
  });
}

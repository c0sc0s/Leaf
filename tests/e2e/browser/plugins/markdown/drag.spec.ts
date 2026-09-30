import { test, expect } from '@playwright/test';
import { emptyLibrary } from '../../../../support/empty-library';

test.beforeEach(async ({ page }) => {
  await emptyLibrary(page);
  await expect(page.getByRole('heading', { name: '我的书架', exact: true })).toBeVisible();
});

test('dragging reader images or internal content never opens book import', async ({ page }) => {
  await page.route('https://images.example.test/diagram.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="blue"/></svg>',
    }),
  );
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'image-drag.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Image drag\n\n![Plain image](https://images.example.test/diagram.svg)\n\n[![Linked image](https://images.example.test/diagram.svg)](#image-drag)\n\nSelectable text.',
    ),
  });
  await page.getByRole('button', { name: '阅读 Image drag', exact: true }).click();
  for (const alt of ['Plain image', 'Linked image']) {
    const image = page.getByAltText(alt, { exact: true });
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240);
    await expect(image).toHaveAttribute('draggable', 'false');
    const box = (await image.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 12 });
    await expect(page.locator('.drop-overlay')).toHaveCount(0);
    await page.mouse.up();
  }
  // Browser image drags can advertise Files. Even such an internal payload must be ignored.
  const internalFile = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['# Accidental import'], 'internal.md', { type: 'text/markdown' }));
    return transfer;
  });
  const imageDragAllowed = await page
    .getByAltText('Plain image')
    .evaluate((image) =>
      image.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true })),
    );
  expect(imageDragAllowed).toBe(false);
  await page
    .locator('.markdown-content')
    .dispatchEvent('dragstart', { dataTransfer: internalFile });
  await page.locator('.app-shell').dispatchEvent('dragenter', { dataTransfer: internalFile });
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: internalFile });
  await page.locator('.markdown-content').dispatchEvent('dragend');
  await internalFile.dispose();
  await page.getByLabel('返回书架', { exact: true }).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByRole('button', { name: '阅读 Image drag', exact: true }).click();
  // A cancelled drag has no dragend event; it must not block the next external drop.
  await page.getByAltText('Plain image').dispatchEvent('dragstart');
  const external = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['# After cancelled drag'], 'after.md', { type: 'text/markdown' }));
    return transfer;
  });
  await page.locator('.app-shell').dispatchEvent('dragenter', { dataTransfer: external });
  await expect(page.locator('.drop-overlay')).toBeVisible();
  await page.locator('.app-shell').dispatchEvent('drop', { dataTransfer: external });
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  await page.getByLabel('返回书架', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: '阅读 After cancelled drag', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.book-card')).toHaveCount(2);
  await external.dispose();
});

test('external URLs are ignored but external file drops still import books', async ({ page }) => {
  const url = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData('text/uri-list', 'https://images.example.test/diagram.svg');
    return transfer;
  });
  const shell = page.locator('.app-shell');
  await shell.dispatchEvent('dragenter', { dataTransfer: url });
  await shell.dispatchEvent('dragover', { dataTransfer: url });
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  await shell.dispatchEvent('drop', { dataTransfer: url });
  await url.dispose();
  await expect(page.locator('.book-card')).toHaveCount(0);
  const file = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['# Dropped book\n\nBody.'], 'dropped.md', { type: 'text/markdown' }),
    );
    return transfer;
  });
  await shell.dispatchEvent('dragenter', { dataTransfer: file });
  await expect(page.locator('.drop-overlay')).toBeVisible();
  await shell.dispatchEvent('dragover', { dataTransfer: file });
  await shell.dispatchEvent('drop', { dataTransfer: file });
  await expect(page.locator('.drop-overlay')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '阅读 Dropped book', exact: true })).toBeVisible();
  await file.dispose();
});

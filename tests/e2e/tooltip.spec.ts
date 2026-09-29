import { test, expect, type Page } from '@playwright/test';

async function expectAnchoredTooltip(page: Page, label: string) {
  const trigger = page.getByRole('tab', { name: label, exact: true });
  await trigger.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveText(label);
  await expect
    .poll(async () => {
      const anchor = (await trigger.boundingBox())!;
      const content = (await tooltip.boundingBox())!;
      const center = Math.max(
        content.width / 2,
        Math.min(page.viewportSize()!.width - content.width / 2, anchor.x + anchor.width / 2),
      );
      return Math.abs(content.x + content.width / 2 - center);
    })
    .toBeLessThan(2);
  const anchor = (await trigger.boundingBox())!;
  const content = (await tooltip.boundingBox())!;
  expect(content.y).toBeGreaterThanOrEqual(anchor.y + anchor.height);
  expect(content.y - (anchor.y + anchor.height)).toBeLessThan(20);
  await page.mouse.move(700, 400, { steps: 5 });
  await expect(tooltip).toHaveCount(0);
}

test('anchors all PDF and Markdown sidebar tooltips to their tabs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await page.getByLabel('文档导航', { exact: true }).click();
  for (const label of ['页面缩略图', '文档目录', '文档书签']) {
    await expectAnchoredTooltip(page, label);
  }
  const outline = page.getByRole('tab', { name: '文档目录', exact: true });
  await outline.click();
  await expect(outline).toHaveAttribute('aria-selected', 'true');
  await outline.press('ArrowRight');
  const bookmarks = page.getByRole('tab', { name: '文档书签', exact: true });
  await expect(bookmarks).toBeFocused();
  await expect(bookmarks).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tooltip')).toHaveText('文档书签');

  await page.getByLabel('返回书架', { exact: true }).click();
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'tooltip.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Tooltip 示例\n\n正文'),
  });
  await page.getByRole('button', { name: '阅读 Tooltip 示例', exact: true }).click();
  for (const label of ['章节列表', '文档目录', '文档书签']) {
    await expectAnchoredTooltip(page, label);
  }
});

test('does not flash tooltips on a brief hover after another tooltip closes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('网格视图', { exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('网格视图');
  await page.mouse.move(700, 400, { steps: 5 });
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByLabel('列表视图', { exact: true }).hover();
  await page.waitForTimeout(150);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.mouse.move(700, 400, { steps: 5 });
  await page.waitForTimeout(500);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.getByLabel('列表视图', { exact: true }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('列表视图');
});

test('ignores pointer focus restoration while keeping keyboard focus tooltips', async ({
  page,
}) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: '设置', exact: true });
  await settings.click();
  const dialog = page.getByRole('dialog', { name: '阅读偏好' });
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeFocused();
  await page.waitForTimeout(500);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(settings).toBeFocused();
  await expect(page.getByRole('tooltip')).toHaveText('设置');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

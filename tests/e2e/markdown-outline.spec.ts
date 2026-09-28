import { test, expect } from '@playwright/test';

test('uses the shared outline tree, keyboard expansion, heading tracking and bookmark tabs', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'outline.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Unified outline\n\n## Section\n\n' +
        'Paragraph.\n\n'.repeat(35) +
        '\n### Subsection\n\n' +
        'More text.\n\n'.repeat(35) +
        '\n## Ending\n\nFinal paragraph.',
    ),
  });
  await page.getByRole('button', { name: '阅读 Unified outline', exact: true }).click();
  await expect(page.getByRole('tab', { name: '文档目录', exact: true })).toHaveAttribute(
    'data-state',
    'active',
  );
  const root = page.getByRole('treeitem', { name: 'Unified outline 1', exact: true });
  await expect(root).toHaveAttribute('aria-expanded', 'false');
  await expect(root).toHaveCSS('border-radius', '10px');
  await root.focus();
  await page.keyboard.press('ArrowRight');
  await expect(root).toHaveAttribute('aria-expanded', 'true');
  const section = page.getByRole('treeitem', { name: 'Section 1', exact: true });
  await expect(section).toHaveAttribute('aria-level', '2');
  await page.keyboard.press('ArrowDown');
  await expect(section).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const subsection = page.getByRole('treeitem', { name: 'Subsection 1', exact: true });
  await expect(subsection).toHaveAttribute('aria-level', '3');
  await subsection.click();
  await expect(subsection).toHaveAttribute('aria-selected', 'true');
  await page.mouse.move(900, 400);
  for (const dark of [false, true]) {
    await page.evaluate((value) => document.documentElement.classList.toggle('dark', value), dark);
    await expect(root).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(section).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(subsection).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.reader-sidebar')).toHaveCSS('border-right-width', '0px');
    await expect(page.getByRole('tree')).toHaveCSS('outline-style', 'none');
    await expect(page.locator('.sidebar-tabs')).toHaveCSS('border-bottom-width', '0px');
    await expect(page.locator('.reader-status')).toHaveCSS('border-top-width', '0px');
  }
  await root.hover();
  await expect(root).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.mouse.move(900, 400);
  await expect(root).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.screenshot({ path: 'test-results/markdown-outline-selected-only.png' });
  await expect(page.locator('#md-subsection')).toBeInViewport();
  await page.locator('#md-ending').evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await expect(page.getByRole('treeitem', { name: 'Ending 1', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByLabel('添加书签', { exact: true }).click();
  await page.getByRole('tab', { name: '文档书签', exact: true }).click();
  await expect(page.locator('.reader-sidebar .outline-item')).toContainText('Unified outline');
  await page.locator('.reader-sidebar .outline-item').click();
  await expect(page.locator('.markdown-scroll')).toHaveJSProperty('scrollTop', 0);
  await page.getByRole('tab', { name: '章节列表', exact: true }).click();
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await page.getByRole('tab', { name: '文档目录', exact: true }).click();
  await root.locator('.outline-toggle').click();
  await section.locator('.outline-toggle').click();
  await expect(subsection).toBeVisible();
  await page.screenshot({ path: 'test-results/markdown-shared-outline.png' });
});

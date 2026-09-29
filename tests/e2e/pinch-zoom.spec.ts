import { test, expect } from '@playwright/test';

test('commits a trackpad pinch once it settles and leaves no preview scale behind', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: /^阅读 / })
    .first()
    .click();
  await expect(page.locator('.pdf-paper').first()).toHaveAttribute('aria-busy', 'false');
  const zoom = page.locator('.zoom-label');
  await expect(zoom).toHaveText('100%');

  await page.locator('.reading-canvas').hover();
  await page.keyboard.down('Control');
  for (let step = 0; step < 12; step++) await page.mouse.wheel(0, -10);
  await page.keyboard.up('Control');

  await expect(zoom).not.toHaveText('100%');
  // Once committed, the page is laid out at the new zoom rather than scaled on screen.
  const content = page.locator('.reading-canvas > *').first();
  await expect(content).not.toHaveAttribute('style', /scale\(/);
  await expect(page.locator('.pdf-paper').first()).toHaveAttribute('aria-busy', 'false');
});

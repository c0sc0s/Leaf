import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { glassOpacity } from '../../../../src/platform/appearance';

test('shows the cover atmosphere over the sidebar in Windows glass and opaque themes', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '阅读 The Art of Noticing', exact: true }).click();
  await page.getByLabel('返回书架', { exact: true }).click();
  const atmosphere = page.locator('.reading-atmosphere');
  await expect(atmosphere).toHaveCSS('opacity', '1');
  const sidebar = page.locator('.library-sidebar');

  for (const mode of ['windows-dark', 'windows-light', 'opaque-dark'] as const) {
    const dark = mode !== 'windows-light';
    const glass = mode !== 'opaque-dark';
    const opacity = glassOpacity('win32', 13, dark);
    // Exercise Windows renderer compositing without requiring a native Windows backdrop.
    await page.evaluate(
      ({ dark, glass, opacity }) => {
        const root = document.documentElement;
        root.classList.toggle('dark', dark);
        root.classList.toggle('vibrant', glass);
        root.dataset.theme = dark ? 'dark' : 'light';
        root.style.setProperty(
          `--glass-surface-${root.dataset.theme}`,
          `${opacity.surface * 100}%`,
        );
        root.style.setProperty(`--glass-chrome-${root.dataset.theme}`, `${opacity.chrome * 100}%`);
      },
      { dark, glass, opacity },
    );

    const visible = await sidebar.screenshot({ animations: 'disabled' });
    await atmosphere.evaluate((el) => ((el as HTMLElement).style.visibility = 'hidden'));
    const hidden = await sidebar.screenshot({ animations: 'disabled' });
    await atmosphere.evaluate((el) => ((el as HTMLElement).style.visibility = ''));
    const before = await sharp(visible).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const after = await sharp(hidden).removeAlpha().raw().toBuffer();
    const difference = (y: number) => {
      const offset = (y * before.info.width + before.info.width - 16) * 3;
      return [0, 1, 2].reduce(
        (total, channel) =>
          total + Math.abs(before.data[offset + channel] - after[offset + channel]),
        0,
      );
    };
    expect(difference(20), mode).toBeGreaterThan(50);
    // Keep the control sample above footer buttons, which animate their theme colours separately.
    expect(difference(before.info.height - 80), mode).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`${mode}.png`), animations: 'disabled' });
  }
  await sidebar.getByRole('button', { name: '收藏', exact: false }).click();
  await expect(atmosphere).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '把喜欢的书留在这里' })).toBeVisible();
});

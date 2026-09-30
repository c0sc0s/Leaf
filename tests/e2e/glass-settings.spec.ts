import { test, expect, _electron } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { glassOpacity, type GlassPlatform } from '../../src/platform/appearance';

test('explains unavailable native glass controls in the browser', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '毛玻璃背景' })).toBeDisabled();
  await expect(page.getByRole('slider', { name: '背景透明度' })).toBeDisabled();
  await expect(page.locator('html')).not.toHaveClass(/vibrant/);
});

test('changes native glass live and retains the toggle and transparency after restart', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'leaf-glass-settings-'));
  const launch = () =>
    _electron.launch({
      args: ['.', '--dev'],
      env: { ...process.env, LEAF_USER_DATA: profile },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const supported = await page.evaluate(() => window.desktop?.translucent);
    test.skip(!supported, 'Native glass is unavailable on this operating system.');
    await expect(page.locator('.book-card')).toHaveCount(8);
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      const target = win as typeof win & { glassMaterials: (string | null)[] };
      target.glassMaterials = [];
      if (process.platform === 'darwin') {
        const original = win.setVibrancy.bind(win);
        win.setVibrancy = (material, options) => {
          target.glassMaterials.push(material);
          original(material, options);
        };
      } else {
        const original = win.setBackgroundMaterial.bind(win);
        win.setBackgroundMaterial = (material) => {
          target.glassMaterials.push(material);
          original(material);
        };
      }
    });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const toggle = page.getByRole('switch', { name: '毛玻璃背景' });
    const slider = page.getByRole('slider', { name: '背景透明度' });
    await expect(toggle).toBeChecked();
    await expect(slider).toHaveValue('13');
    await page.screenshot({
      path: test.info().outputPath('glass-settings-light.png'),
      animations: 'disabled',
    });
    await slider.focus();
    await slider.press('End');
    await expect(slider).toHaveValue('100');
    await expect(page.locator('.library-main')).toHaveCSS(
      'background-color',
      'color(srgb 0 0 0 / 0)',
    );
    await slider.press('Home');
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('1');
    const background = await page
      .locator('.library-main')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const platform = (await page.evaluate(() => window.desktop?.platform)) as GlassPlatform;
    expect(Number(background.match(/\/ ([\d.]+)\)$/)?.[1])).toBeCloseTo(
      glassOpacity(platform, 1, false).surface,
      3,
    );
    if (platform === 'win32') {
      await expect(page.locator('.window-controls')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
    } else {
      // macOS uses native traffic lights instead of the Windows control overlay.
      await expect(page.locator('.window-controls')).toHaveCount(0);
    }
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(slider).toBeDisabled();
    await expect(page.locator('html')).not.toHaveClass(/vibrant/);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => {
          const win = BrowserWindow.getAllWindows()[0] as Electron.BrowserWindow & {
            glassMaterials: (string | null)[];
          };
          return {
            color: win.getBackgroundColor().toLowerCase(),
            removed: win.glassMaterials.includes(process.platform === 'darwin' ? null : 'none'),
          };
        }),
      )
      .toEqual({ color: '#ffffff', removed: true });
    await page.getByRole('radio', { name: '深色', exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath('glass-settings-dark.png'),
      animations: 'disabled',
    });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase(),
        ),
      )
      .toBe('#0a0a0a');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('.book-card')).toHaveCount(8);
    await expect(page.locator('html')).not.toHaveClass(/vibrant/);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('switch', { name: '毛玻璃背景' })).not.toBeChecked();
    await expect(page.getByRole('slider', { name: '背景透明度' })).toHaveValue('1');
    await page.getByRole('switch', { name: '毛玻璃背景' }).click();
    await expect(page.locator('html')).toHaveClass(/vibrant/);
    await expect(page.getByRole('slider', { name: '背景透明度' })).toBeEnabled();
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getBackgroundColor().toLowerCase(),
        ),
      )
      .toBe('#000000');
  } finally {
    await app.close();
  }
});

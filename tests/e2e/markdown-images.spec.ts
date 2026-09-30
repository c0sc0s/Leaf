import { test, expect } from '@playwright/test';

test('renders remote HTTP and HTTPS images while keeping unsafe image URLs blocked', async ({
  page,
}) => {
  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZVQAAAAASUVORK5CYII=',
    'base64',
  );
  const violations: string[] = [];
  // This image-only fixture starts with an empty library, without generating PDF covers.
  await page.addInitScript(() => localStorage.setItem('folio-initialized', '1'));
  await page.exposeFunction('imagePolicyViolation', (url: string) => violations.push(url));
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (event) => {
      if (event.effectiveDirective === 'img-src')
        void (
          window as unknown as { imagePolicyViolation: (url: string) => Promise<void> }
        ).imagePolicyViolation(event.blockedURI);
    }),
  );
  const urls = [
    'https://resource.duyiedu.com/yuanjin/202606081330833.png',
    'http://images.example.test/pixel.png',
  ];
  for (const url of urls)
    await page.route(url, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: pixel }),
    );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架', exact: true })).toBeVisible();
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'remote-images.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(
      '# Remote image specimen\n\n![HTTPS image](' +
        urls[0] +
        ')\n\n![HTTP image](' +
        urls[1] +
        ')\n\n![Unsafe](javascript:alert(1))',
    ),
  });
  await page.getByRole('button', { name: '阅读 Remote image specimen', exact: true }).click();
  await expect(page.locator('.markdown-content img')).toHaveCount(2);
  for (const alt of ['HTTPS image', 'HTTP image']) {
    await expect
      .poll(() =>
        page
          .getByAltText(alt, { exact: true })
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(1);
  }
  await expect(page.locator('.markdown-missing-image')).toContainText('Unsafe');
  expect(violations).toEqual([]);
});

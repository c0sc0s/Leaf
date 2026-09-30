import { openReaderSettings } from '../../../../support/reader-menu';
import { test, expect, type Page } from '@playwright/test';

const javascript = 'const value = "hello";\n\tconsole.log(value);\n';
const literal = '<img src=x onerror="window.codeExecuted = true">\n<script>alert(1)</script>\n';
const unknown = '  Keep indentation and symbols: <>&\n';
const markdown = [
  '# Code block specimen',
  'Inline `const inline = 1` stays inline.',
  '```js\n' + javascript + '```',
  '```python\ndef greet(name):\n    return "Hello " + name\n```',
  '```html\n' + literal + '```',
  '```leaf-unknown\n' + unknown + '```',
  '```\nprint("Unlabelled code")\n```',
].join('\n\n');

async function openCodeBook(page: Page) {
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择阅读文件', { exact: true }).setInputFiles({
    name: 'code-blocks.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(markdown),
  });
  await page.getByRole('button', { name: '阅读 Code block specimen', exact: true }).click();
  await expect(page.locator('.markdown-code-block')).toHaveCount(5);
}

test('highlights code in both themes, copies exact text, and keeps code searches and HTML safe', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCodeBook(page);
  await expect(page.locator('.markdown-scroll')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await page.evaluate(() => {
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (text: string) => {
        (window as Window & { copiedCode?: string }).copiedCode = text;
        await writeText(text);
      },
    });
  });
  const blocks = page.locator('.markdown-code-block');
  const js = blocks.nth(0);
  await expect(js.locator('.markdown-code-language')).toHaveText('js');
  await expect(js.locator('code')).toHaveText(javascript);
  await expect(js.locator('.hljs-keyword')).toHaveText('const');
  await expect(js.locator('.hljs-string')).toHaveText('"hello"');
  const lightColor = await js
    .locator('.hljs-keyword')
    .evaluate((node) => getComputedStyle(node).color);
  expect(lightColor).not.toBe(
    await js.locator('.hljs-string').evaluate((node) => getComputedStyle(node).color),
  );
  await expect(blocks.nth(1).locator('.hljs-keyword')).toHaveCount(2);
  await expect(page.locator('.markdown-content > p code')).toHaveText('const inline = 1');
  await expect(blocks.nth(2).locator('code')).toHaveText(literal);
  await expect(blocks.nth(2).locator('img, script')).toHaveCount(0);
  await expect(blocks.nth(3).locator('code')).toHaveText(unknown);
  await expect(blocks.nth(4).locator('.hljs span')).not.toHaveCount(0);
  for (const [index, source] of [
    [0, javascript],
    [2, literal],
    [3, unknown],
  ] as const) {
    const block = blocks.nth(index);
    await block.getByRole('button', { name: '复制代码', exact: true }).click();
    await expect(block.getByRole('button', { name: '已复制代码', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { copiedCode?: string }).copiedCode)).toBe(
      source,
    );
    // Windows exposes native clipboard line endings as CRLF.
    expect(
      (await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'),
    ).toBe(source);
  }
  await openReaderSettings(page);
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.markdown-scroll')).toHaveClass(/markdown-dark/);
  await expect(page.locator('.markdown-scroll')).toHaveCSS('background-color', 'rgb(27, 27, 30)');
  expect(
    await js.locator('.hljs-keyword').evaluate((node) => getComputedStyle(node).color),
  ).not.toBe(lightColor);
  await page.getByRole('button', { name: '搜索文档', exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('const value');
  await page.locator('.search-result').click();
  await expect.poll(() => js.locator('code mark').allTextContents()).toEqual(['const', ' value']);
  await expect(js.locator('code')).toHaveText(javascript);
  await expect(js.getByRole('button', { name: '复制代码', exact: true })).toBeVisible();
  await js.getByRole('button', { name: '复制代码', exact: true }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(
    javascript,
  );
  await js.screenshot({ path: 'test-results/markdown-code-dark.png' });
  expect(errors).toEqual([]);
});

test('reports clipboard failure and allows a retry', async ({ page }) => {
  await openCodeBook(page);
  const block = page.locator('.markdown-code-block').first();
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new DOMException('Clipboard unavailable', 'NotAllowedError');
      },
    });
  });
  await block.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect(block.getByRole('button', { name: '复制代码', exact: true })).toHaveText(
    '复制失败，重试',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {},
    });
  });
  await block.getByRole('button', { name: '复制代码', exact: true }).click();
  await expect(block.getByRole('button', { name: '已复制代码', exact: true })).toBeVisible();
});

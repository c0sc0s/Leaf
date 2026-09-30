import { _electron, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

// Exercise the same application protocol used by the packaged desktop build.
const directory = await mkdtemp(path.join(tmpdir(), 'leaf-production-'));
const markdownFile = path.join(directory, 'production.md');
const pdfFile = path.join(directory, 'production.pdf');
const output = path.join(directory, 'annotated.pdf');
await writeFile(
  markdownFile,
  '# Production Markdown\n\nA &amp; B &copy;. A unique needle.\n\n```js\nconst value = 1;\n```',
);
const source = await PDFDocument.create();
source.setTitle('Production PDF');
const font = await source.embedFont(StandardFonts.Helvetica);
for (let page = 1; page <= 3; page++)
  source
    .addPage([600, 800])
    .drawText(`Production ALPHA ${page}`, { font, size: 18, x: 50, y: 700 });
await writeFile(pdfFile, await source.save());
const requests = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  requests.push(body);
  const searched = body.messages.some((message) => message.role === 'tool');
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const send = (delta, finish = null, usage) =>
    response.write(
      `data: ${JSON.stringify({
        model: 'production-mock',
        choices: [{ index: 0, delta, finish_reason: finish }],
        ...(usage ? { usage } : {}),
      })}\n\n`,
    );
  if (searched) {
    const reference = body.messages
      .find((message) => message.role === 'tool')
      .content.match(/\[ref\.\d+\]/)[0];
    send({ content: `Production answer ${reference}.` });
  } else
    send({
      tool_calls: [
        {
          index: 0,
          id: 'production-search',
          type: 'function',
          function: { name: 'search_book', arguments: '{"query":"ALPHA"}' },
        },
      ],
    });
  send({}, searched ? 'stop' : 'tool_calls', {
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: { cached_tokens: 4 },
  });
  response.end('data: [DONE]\n\n');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const launch = () =>
  _electron.launch({
    ...(process.env.LEAF_EXECUTABLE
      ? { executablePath: process.env.LEAF_EXECUTABLE, args: [] }
      : { args: ['.'] }),
    env: {
      LEAF_HIDDEN_WINDOW: '1',
      ...process.env,
      LEAF_USER_DATA: path.join(directory, 'profile'),
      LEAF_AI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
      LEAF_AI_MODEL: 'production-mock',
      LEAF_AI_API_KEY: 'production-test-key',
    },
  });
let app = await launch();
try {
  const page = await app.firstWindow();
  await expect(page).toHaveURL('leaf://app/index.html');
  const errors = [];
  const workers = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('worker', (worker) => workers.push(worker.url()));
  const importMenu = page.locator('.import-trigger');
  await expect(importMenu).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.book-card')).toHaveCount(0);
  const choose = async (file) =>
    app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.locator('.plugin-card')).toHaveCount(1);
  await expect(page.locator('[data-plugin-id="leaf.pdf"]')).toContainText('已启用');
  await choose(path.resolve('dist-plugins/leaf.markdown.leaf-plugin'));
  await page.getByRole('button', { name: '安装插件包', exact: true }).click();
  await expect(page.locator('[data-plugin-id="leaf.markdown"]')).toContainText('已启用');
  await choose(path.resolve('dist-plugins/leaf.ai.leaf-plugin'));
  await page.getByRole('button', { name: '安装插件包', exact: true }).click();
  await expect(page.locator('[data-plugin-id="leaf.ai"]')).toContainText('已启用');
  await page.keyboard.press('Escape');
  await choose(markdownFile);
  await importMenu.click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await page.getByRole('button', { name: '阅读 Production Markdown', exact: true }).click();
  await expect(page.locator('.markdown-content h1')).toHaveText('Production Markdown');
  await expect(page.locator('.markdown-content p')).toHaveText('A & B ©. A unique needle.');
  await expect(page.locator('.markdown-content .hljs-keyword')).toHaveText('const');
  await page.getByLabel('搜索文档', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('unique needle');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.getByLabel('返回书架', { exact: true }).click();
  await choose(pdfFile);
  await importMenu.click();
  await page.getByRole('menuitem', { name: /^导入文件(?!夹)/ }).click();
  await expect(page.locator('.book-card')).toHaveCount(2);
  await page.getByRole('button', { name: '阅读 Production PDF', exact: true }).click();
  await expect(page.locator('.pdf-paper[data-page="1"]')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('搜索文档', { exact: true }).click();
  await page.getByLabel('搜索文档内容', { exact: true }).fill('ALPHA');
  await expect(page.locator('.search-status')).toHaveText('3 处匹配');
  const selectText = () =>
    page
      .locator('.textLayer [data-start]')
      .filter({ hasText: 'Production ALPHA 1' })
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
  await selectText();
  await page.getByLabel('高光标注', { exact: true }).click();
  await page.getByLabel('阅读笔记', { exact: true }).last().click();
  await page.getByLabel('第 1 页批注笔记', { exact: true }).fill('Production persisted note.');
  await page.getByLabel('第 1 页批注笔记', { exact: true }).press('Tab');
  await page.getByLabel('关闭笔记', { exact: true }).click();
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByLabel('更多阅读操作', { exact: true }).click();
  await page.getByRole('menuitem', { name: '导出批注 PDF', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已导出');
  const result = await PDFDocument.load(await readFile(output));
  expect(result.getPageCount()).toBe(3);
  expect(result.getPage(0).node.get(PDFName.of('Annots'))).toBeTruthy();
  for (const name of ['markdown.worker', 'search.worker', 'export.worker'])
    expect(
      workers.some((url) => url.includes(name)),
      `Missing ${name} in ${workers.join(', ')}`,
    ).toBe(true);
  await selectText();
  await page.getByLabel('问 AI', { exact: true }).click();
  await page.getByLabel('输入问题', { exact: true }).fill('Find ALPHA in the document.');
  await page.getByLabel('输入问题', { exact: true }).press('Enter');
  await expect(page.locator('.ask-answer')).toContainText('Production answer', { timeout: 30000 });
  await expect(page.locator('.ask-details')).toBeVisible();
  await page.getByText('模型与执行记录', { exact: true }).click();
  await expect(page.locator('.ask-details')).toContainText('production-mock');
  await expect(page.locator('.ask-details')).toContainText('输入 200 / 输出 40 tokens');
  await expect(page.locator('.ask-details')).toContainText('search_book · complete');
  expect(requests).toHaveLength(2);
  expect(requests[1].messages.find((message) => message.role === 'tool').content).toMatch(
    /\[ref\.\d+\]/,
  );
  expect(errors).toEqual([]);
  await app.close();
  app = await launch();
  const restored = await app.firstWindow();
  await expect(restored.locator('.book-card')).toHaveCount(2);
  await restored.getByRole('button', { name: '阅读 Production PDF', exact: true }).click();
  await restored.getByLabel('阅读笔记', { exact: true }).last().click();
  await expect(restored.getByLabel('第 1 页批注笔记', { exact: true })).toHaveValue(
    'Production persisted note.',
  );
  await restored.getByLabel('关闭笔记', { exact: true }).click();
  await restored.getByLabel('AI 问答', { exact: true }).click();
  await restored.locator('.ask-thread-open').click();
  await expect(restored.locator('.ask-question')).toHaveText('Find ALPHA in the document.');
  await expect(restored.locator('.ask-answer')).toContainText('Production answer');
  await restored.getByText('模型与执行记录', { exact: true }).click();
  await expect(restored.locator('.ask-details')).toContainText('search_book · complete');
  console.log(
    'Production checks passed: default PDF, installed Markdown and AI, native import/save, plugin workers, AI tool calls/usage/trace, and persisted annotations and conversations after restart.',
  );
} finally {
  await app.close();
  server.closeAllConnections();
  server.close();
  await rm(directory, { recursive: true, force: true });
}

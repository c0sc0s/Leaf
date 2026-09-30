import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { PDFDocument, StandardFonts } from 'pdf-lib';

interface ChatBody {
  messages: { role: string; content: string | null }[];
  tools?: unknown[];
}

const requests: ChatBody[] = [];
let server: Server;

function sse(chunks: unknown[]) {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
}
const delta = (value: Record<string, unknown>, finish: string | null = null) => ({
  choices: [{ index: 0, delta: value, finish_reason: finish }],
});

// The first turn searches the book; once it sees the tool result it answers with a citation.
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const body: ChatBody = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const searched = body.messages.some((message) => message.role === 'tool');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      sse(
        searched
          ? [
              delta({ content: '这里对比了宽字母和窄字母，' }),
              delta({ content: '说明选区要按实际字宽计算 [p.1]。' }),
              delta({}, 'stop'),
            ]
          : [
              delta({
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'search_book', arguments: '{"query":"narrow"}' },
                  },
                ],
              }),
              delta({}, 'tool_calls'),
            ],
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(5199, '127.0.0.1', resolve));
});
test.afterAll(() => {
  server.closeAllConnections();
  server.close();
});

test('asks about a selection, searches the book, cites the page and keeps the thread', async ({
  page,
}) => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  pdf.setTitle('Ask specimen');
  const sheet = pdf.addPage([500, 600]);
  for (let i = 0; i < 3; i++)
    sheet.drawText(`Line ${i}: Wide WWW and narrow iii, selected accurately.`, {
      font,
      size: 18,
      x: 35,
      y: 520 - i * 22,
    });
  await page.goto('/');
  await expect(page.locator('.book-card')).toHaveCount(8);
  await page.getByLabel('选择 PDF 或 Markdown 文件', { exact: true }).setInputFiles({
    name: 'ask.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '阅读 Ask specimen', exact: true }).click();
  await expect(page.locator('.pdf-paper')).toHaveAttribute('aria-busy', 'false');
  await page.locator('.textLayer').evaluate((root) => {
    const line = root.querySelector('[data-start]')!;
    const range = document.createRange();
    range.setStart(line.firstChild!, 8);
    range.setEnd(line.firstChild!, 16);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('问 AI', { exact: true }).click();
  const panel = page.locator('.ask-panel');
  await expect(panel.locator('.ask-quote')).toContainText('Wide WWW');
  await page.getByLabel('输入问题', { exact: true }).fill('为什么要区分宽窄字母？');
  await page.getByLabel('输入问题', { exact: true }).press('Enter');
  await expect(panel.locator('.ask-answer')).toContainText('说明选区要按实际字宽计算');
  await expect(panel.getByRole('button', { name: '第 1 页', exact: true }).last()).toBeVisible();

  expect(requests).toHaveLength(2);
  const [first, second] = requests;
  expect(first.tools).toHaveLength(3);
  expect(first.messages[1].content).toContain('<selection>\nWide WWW\n</selection>');
  expect(first.messages[1].content).toContain('读者的问题：为什么要区分宽窄字母？');
  const toolResult = second.messages.find((message) => message.role === 'tool');
  expect(toolResult?.content).toContain('[p.1]');

  await page.reload();
  await page.getByRole('button', { name: '阅读 Ask specimen', exact: true }).click();
  await page.getByLabel('AI 问答', { exact: true }).click();
  await page.locator('.ask-thread-open').click();
  await expect(page.locator('.ask-question')).toHaveText('为什么要区分宽窄字母？');
  await expect(page.locator('.ask-answer')).toContainText('说明选区要按实际字宽计算');
});

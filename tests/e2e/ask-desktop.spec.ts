import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

test('desktop streams a chat turn through the main process and cancels by closing the port', async () => {
  let dropped = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const { messages } = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (value: Record<string, unknown>, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: value, finish_reason: finish }] })}\n\n`,
      );
    send({ content: 'desktop ' });
    if (messages[0].content === 'hang') {
      res.on('close', () => (dropped = true));
      return;
    }
    send({ content: 'reply' });
    send({}, 'stop');
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const profile = await mkdtemp(path.join(tmpdir(), 'leaf-ask-desktop-'));
  const app = await electron.launch({
    args: ['.', '--dev'],
    env: {
      ...process.env,
      LEAF_USER_DATA: profile,
      LEAF_AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      LEAF_AI_MODEL: 'desktop-mock',
      LEAF_AI_API_KEY: 'desktop-key',
    },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.library-main')).toBeVisible();
    const result = await page.evaluate(async () => {
      const { chat, readAiConfig } = await import('/src/ai/transport.ts');
      const config = await readAiConfig();
      const streamed: string[] = [];
      const reply = await chat(
        { messages: [{ role: 'user', content: 'hello' }] },
        { signal: new AbortController().signal, onText: (text) => streamed.push(text) },
      );
      return { config, streamed, text: reply.text, model: reply.model };
    });
    expect(result).toEqual({
      config: {
        baseURL: `http://127.0.0.1:${port}/v1`,
        model: 'desktop-mock',
        hasKey: true,
        managed: true,
      },
      streamed: ['desktop ', 'reply'],
      text: 'desktop reply',
      model: 'desktop-mock',
    });
    const cancelled = await page.evaluate(async () => {
      const { chat } = await import('/src/ai/transport.ts');
      const controller = new AbortController();
      const turn = chat(
        { messages: [{ role: 'user', content: 'hang' }] },
        { signal: controller.signal, onText: () => controller.abort() },
      );
      return turn.then(
        () => 'resolved',
        (error: Error) => error.name,
      );
    });
    expect(cancelled).toBe('AbortError');
    await expect.poll(() => dropped).toBe(true);
  } finally {
    await app.close();
    server.closeAllConnections();
    server.close();
    await rm(profile, { recursive: true, force: true });
  }
});

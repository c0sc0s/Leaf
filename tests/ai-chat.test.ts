import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { streamChat, type ModelSettings } from '../plugins/ai/src/models/provider.ts';
import type { ChatEvent } from '../plugins/ai/src/models/types.ts';

type Handler = (body: Record<string, unknown>, res: ServerResponse, req: IncomingMessage) => void;
const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

async function provider(handler: Handler) {
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    handler(JSON.parse(Buffer.concat(chunks).toString()), res, req);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { baseURL: `http://127.0.0.1:${port}/v1`, model: 'mock', apiKey: 'test-key' };
}

function sse(res: ServerResponse, chunks: unknown[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  res.end('data: [DONE]\n\n');
}

const delta = (value: Record<string, unknown>, finish: string | null = null) => ({
  choices: [{ index: 0, delta: value, finish_reason: finish }],
});

async function run(config: ModelSettings, request: unknown, signal = new AbortController().signal) {
  const events: ChatEvent[] = [];
  await streamChat(config, request, signal, (event) => events.push(event));
  return events;
}

const question = { messages: [{ role: 'user', content: 'hi' }] };

describe('AI chat stream', () => {
  it('streams text, assembles fragmented tool calls and reports cache usage', async () => {
    let seen: Record<string, unknown> = {};
    let authorization: string | undefined;
    const config = await provider((body, res, req) => {
      seen = body;
      authorization = req.headers.authorization;
      sse(res, [
        delta({ content: 'Let me ' }),
        delta({ content: 'check.' }),
        delta({
          tool_calls: [
            { index: 0, id: 'call-1', function: { name: 'search_book', arguments: '{"que' } },
          ],
        }),
        delta({ tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }] }),
        delta({}, 'tool_calls'),
        {
          choices: [],
          usage: { prompt_tokens: 100, completion_tokens: 7, prompt_cache_hit_tokens: 64 },
        },
      ]);
    });
    const tools = [
      {
        type: 'function',
        function: { name: 'search_book', description: 'd', parameters: { type: 'object' } },
      },
    ];
    const events = await run(config, { ...question, tools });
    expect(authorization).toBe('Bearer test-key');
    expect(seen).toMatchObject({ model: 'mock', stream: true, tools });
    expect(events).toEqual([
      { type: 'text', text: 'Let me ' },
      { type: 'text', text: 'check.' },
      {
        type: 'done',
        model: 'mock',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-1', name: 'search_book', arguments: '{"query":"x"}' }],
        usage: { promptTokens: 100, completionTokens: 7, cachedTokens: 64 },
      },
    ]);
  });

  it('reports a rejected key as an auth error instead of throwing', async () => {
    const config = await provider((_body, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'bad key' } }));
    });
    const events = await run(config, question);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', code: 'auth' });
  });

  it('rejects malformed renderer requests before contacting the service', async () => {
    let contacted = false;
    const config = await provider((_body, res) => {
      contacted = true;
      sse(res, []);
    });
    for (const request of [
      { messages: [] },
      { messages: [{ role: 'root', content: 'x' }] },
      { messages: [{ role: 'tool', content: 'x' }] },
      { ...question, tools: [{ type: 'function', function: { name: 'bad name!' } }] },
    ])
      expect(await run(config, request)).toEqual([
        expect.objectContaining({ type: 'error', code: 'request' }),
      ]);
    expect(contacted).toBe(false);
  });

  it('reports a stream that ends without a finish reason as interrupted', async () => {
    const config = await provider((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(`data: ${JSON.stringify(delta({ content: 'half an ans' }))}\n\n`);
    });
    const events = await run(config, question);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'network' });
  });

  it('emits nothing after the turn is cancelled', async () => {
    const controller = new AbortController();
    const config = await provider((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify(delta({ content: 'partial' }))}\n\n`);
      setTimeout(() => controller.abort(), 20);
    });
    const events = await run(config, question, controller.signal);
    expect(events.filter((event) => event.type !== 'text')).toEqual([]);
  });
});

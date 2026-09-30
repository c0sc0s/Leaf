import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Accepts only same-origin POSTs from the local dev page carrying `header`, so other sites
 * open in the browser cannot reach the library or the model service through the dev server.
 */
export function isLocalRequest(req: IncomingMessage, header: string) {
  const origin = `http://${req.headers.host}`;
  return (
    ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname) &&
    req.method === 'POST' &&
    req.headers.origin === origin &&
    req.headers[header] === '1'
  );
}

export async function readJson(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

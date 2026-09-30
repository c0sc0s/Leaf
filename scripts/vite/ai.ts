import path from 'node:path';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { createAiService } from '../../electron/ai/service.ts';
import { isLocalRequest, readJson, sendJson } from './request.ts';

// Browser development only: the key sits in plain text under .leaf-data on this machine.
const plaintext = { encrypt: (text: string) => text, decrypt: (text: string) => text };

/** Serves the model service to the browser build; chat turns stream back as NDJSON. */
export default function aiPlugin(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    const ai = createAiService({
      file: path.join(process.env.LEAF_BROWSER_DATA || '.leaf-data', 'ai.json'),
      cipher: plaintext,
      env: process.env,
    });
    server.middlewares.use('/__leaf_ai', async (req, res) => {
      if (!isLocalRequest(req, 'x-leaf-ai')) {
        res.writeHead(403).end();
        return;
      }
      try {
        const { operation, input } = await readJson(req, 8 * 1024 * 1024);
        if (operation === 'chat') {
          const controller = new AbortController();
          res.on('close', () => {
            if (!res.writableEnded) controller.abort();
          });
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          await ai.chat(input, controller.signal, (event) =>
            res.write(JSON.stringify(event) + '\n'),
          );
          res.end();
          return;
        }
        const operations = { config: () => ai.summary(), configure: () => ai.configure(input) };
        if (!Object.hasOwn(operations, operation)) throw new Error('Unknown AI operation');
        sendJson(res, 200, { result: operations[operation as keyof typeof operations]() });
      } catch (error) {
        if (res.headersSent) {
          res.end();
          throw error;
        }
        sendJson(res, 500, { error: (error as Error).message });
      }
    });
  };
  return { name: 'leaf-ai', configureServer: install, configurePreviewServer: install };
}

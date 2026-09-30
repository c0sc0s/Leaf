import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { createStorage, type Storage } from '../../electron/storage/client.ts';
import { isLocalRequest, readJson, sendJson } from './request.ts';

interface Entry {
  client: Storage;
  active: number;
  timer?: NodeJS.Timeout;
  closing?: Promise<void>;
}

/** Serves the SQLite library to the browser build, one library per browser cookie. */
export default function storagePlugin(): Plugin {
  const clients = new Map<string, Entry>();
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/__leaf_storage', async (req, res) => {
      try {
        if (!isLocalRequest(req, 'x-leaf-storage')) {
          res.writeHead(403).end();
          return;
        }
        let id = req.headers.cookie?.match(/(?:^|; )leaf-library=([a-f0-9-]{36})(?:;|$)/)?.[1];
        if (!id) {
          id = randomUUID();
          res.setHeader(
            'Set-Cookie',
            `leaf-library=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
          );
        }
        let entry = clients.get(id);
        if (entry?.closing) {
          await entry.closing;
          entry = undefined;
        }
        if (!entry) {
          entry = {
            client: createStorage(path.join(process.env.LEAF_BROWSER_DATA || '.leaf-data', id)),
            active: 0,
          };
          clients.set(id, entry);
        }
        const current = entry;
        clearTimeout(current.timer);
        current.active++;
        try {
          const { operation, input } = await readJson(req, 64 * 1024 * 1024);
          const result = await current.client.request(operation, input);
          sendJson(res, 200, { result });
        } finally {
          current.active--;
          if (!current.active)
            current.timer = setTimeout(() => {
              // Remove only after closing, so a request cannot open a second writer mid-close.
              current.closing = current.client
                .close()
                .then(
                  () => {},
                  (error) => console.error(error),
                )
                .finally(() => clients.delete(id));
            }, 300000).unref();
        }
      } catch (error) {
        sendJson(res, 500, { error: (error as Error).message });
      }
    });
    server.httpServer?.on('close', () => {
      for (const entry of clients.values()) {
        clearTimeout(entry.timer);
        void entry.client.close().catch(() => {});
      }
    });
  };
  return { name: 'leaf-sqlite', configureServer: install, configurePreviewServer: install };
}

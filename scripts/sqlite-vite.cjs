const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { createStorage } = require('../electron/storage/client.cjs');

module.exports = function sqlitePlugin() {
  const clients = new Map();
  const install = (server) => {
    server.middlewares.use('/__leaf_storage', async (req, res) => {
      try {
        const origin = `http://${req.headers.host}`;
        const hostname = new URL(origin).hostname;
        if (
          !['127.0.0.1', 'localhost', '[::1]'].includes(hostname) ||
          req.method !== 'POST' ||
          req.headers.origin !== origin ||
          req.headers['x-leaf-storage'] !== '1'
        ) {
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
        clearTimeout(entry.timer);
        entry.active++;
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 64 * 1024 * 1024) throw new Error('Storage request too large');
            chunks.push(chunk);
          }
          const { operation, input } = JSON.parse(Buffer.concat(chunks).toString());
          const result = await entry.client.request(operation, input);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ result }));
        } finally {
          entry.active--;
          if (!entry.active)
            entry.timer = setTimeout(() => {
              // Remove only after closing, so a request cannot open a second writer mid-close.
              entry.closing = entry.client
                .close()
                .catch((error) => console.error(error))
                .finally(() => clients.delete(id));
            }, 300000).unref();
        }
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: error.message }));
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
};

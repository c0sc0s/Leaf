import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { createStorage } from '../../electron/storage/client.ts';
import { PluginInstaller } from '../../electron/plugins/installer.ts';
import { BackendManager } from '../../electron/plugins/backend/manager.ts';
import { nodeBackendProcess } from '../../electron/plugins/backend/node.ts';
import { CredentialVault, developmentCipher } from '../../electron/platform/credentials.ts';
import { isLocalRequest, readJson, sendJson } from './request.ts';
import type { BackendEvent, BackendRequest } from '@leaf/contracts/transport';

const pluginRoot = path.resolve(import.meta.dirname, '../../dist-plugins');
const privateStorage = new Set(['plugins.bind', 'plugins.enable', 'plugins.remove']);
interface Profile {
  storage: ReturnType<typeof createStorage>;
  plugins: PluginInstaller;
  backend: BackendManager;
  active: number;
  timer?: ReturnType<typeof setTimeout>;
  closing?: Promise<void>;
}

export default function localServices(): Plugin {
  const profiles = new Map<string, Promise<Profile>>();
  const open = async (id: string): Promise<Profile> => {
    const root = path.resolve(process.env.LEAF_BROWSER_DATA || '.leaf-data', 'reader', id);
    const storage = createStorage(path.join(root, 'storage'));
    let backend: BackendManager;
    const plugins = new PluginInstaller(
      path.join(root, 'plugins'),
      storage,
      (entry, name) => `/__leaf_plugins/${id}/${entry.manifest.id}/${entry.packageHash}/${name}`,
      async (id) => {
        await backend?.stop(id);
      },
    );
    try {
      const credentials = new CredentialVault(
        path.join(root, 'credentials.json'),
        await developmentCipher(path.join(root, 'credentials.key')),
      );
      backend = new BackendManager(
        plugins,
        storage,
        credentials,
        () => nodeBackendProcess(),
        process.env,
      );
      const bundled = (await readdir(pluginRoot))
        .filter((name) => name.endsWith('.leaf-plugin'))
        .map((name) => path.join(pluginRoot, name));
      const defaults =
        process.env.LEAF_TEST_PLUGINS === 'all'
          ? bundled.map((file) => path.basename(file, '.leaf-plugin'))
          : ['leaf.pdf'];
      await plugins.initialize(bundled, defaults);
      return { storage, plugins, backend, active: 0 };
    } catch (error) {
      await storage.close();
      throw error;
    }
  };
  const get = async (id: string): Promise<Profile> => {
    let pending = profiles.get(id);
    if (!pending) {
      pending = open(id);
      profiles.set(id, pending);
      const current = pending;
      void pending.catch(() => {
        if (profiles.get(id) === current) profiles.delete(id);
      });
    }
    const profile = await pending;
    if (profile.closing) {
      await profile.closing;
      return get(id);
    }
    return profile;
  };
  const cookie = (request: IncomingMessage, response: ServerResponse) => {
    const existing = request.headers.cookie?.match(
      /(?:^|; )leaf-reader=([a-f0-9-]{36})(?:;|$)/,
    )?.[1];
    if (existing) return existing;
    const id = randomUUID();
    response.setHeader(
      'Set-Cookie',
      `leaf-reader=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
    );
    return id;
  };
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url || '/', `http://${req.headers.host}`),
        pathname = url.pathname;
      if (
        !['/__leaf_storage', '/__leaf_plugins', '/__leaf_backend'].includes(pathname) &&
        !pathname.startsWith('/__leaf_plugins/')
      )
        return next();
      let profile: Profile | undefined, id: string | undefined;
      try {
        const resource = pathname.startsWith('/__leaf_plugins/');
        if (
          !resource &&
          !isLocalRequest(
            req,
            pathname === '/__leaf_storage'
              ? 'x-leaf-storage'
              : pathname === '/__leaf_plugins'
                ? 'x-leaf-plugins'
                : 'x-leaf-backend',
          )
        ) {
          res.writeHead(403).end();
          return;
        }
        id = cookie(req, res);
        if (
          resource &&
          (req.method !== 'GET' ||
            (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin'))
        ) {
          res.writeHead(403).end();
          return;
        }
        profile = await get(id);
        clearTimeout(profile.timer);
        profile.active++;
        if (resource) {
          const [, , profileId, pluginId, hash, ...parts] = pathname.split('/');
          if (profileId !== id) {
            res.writeHead(403).end();
            return;
          }
          const name = parts.map(decodeURIComponent).join('/'),
            file = await profile.plugins.resource(pluginId, hash, name);
          res.setHeader('Content-Type', mime(file));
          res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
          res.end(await readFile(file));
          return;
        }
        const input = await readJson(
          req,
          pathname === '/__leaf_plugins' ? 90 * 1024 * 1024 : 8 * 1024 * 1024,
        );
        if (pathname === '/__leaf_storage') {
          if (privateStorage.has(input.operation))
            throw new Error('请通过插件管理服务修改安装状态');
          sendJson(res, 200, {
            result: await profile.storage.requestRaw(input.operation, input.input),
          });
        } else if (pathname === '/__leaf_plugins') {
          let result;
          if (input.operation === 'list') result = await profile.plugins.list();
          else if (input.operation === 'prepare' && typeof input.input?.data === 'string')
            result = profile.plugins.inspect(
              new Uint8Array(Buffer.from(input.input.data, 'base64')),
            );
          else if (input.operation === 'install' && typeof input.input?.data === 'string')
            result = await profile.plugins.install(
              new Uint8Array(Buffer.from(input.input.data, 'base64')),
            );
          else if (input.operation === 'enable' && typeof input.input?.enabled === 'boolean')
            await profile.plugins.enable(input.input.id, input.input.enabled);
          else if (input.operation === 'remove') await profile.plugins.remove(input.input.id);
          else throw new Error('无效的插件操作');
          sendJson(res, 200, { result });
        } else {
          const controller = new AbortController();
          const abort = () => controller.abort();
          res.on('close', abort);
          try {
            if (input.stream === true) {
              res.writeHead(200, {
                'Content-Type': 'application/x-ndjson',
                'Cache-Control': 'no-store',
              });
              const emit = (event: BackendEvent) => {
                if (!res.destroyed) res.write(JSON.stringify(event) + '\n');
              };
              try {
                await profile.backend.stream(input as BackendRequest, controller.signal, (value) =>
                  emit({ type: 'event', value }),
                );
                emit({ type: 'done' });
              } catch (error) {
                if (!controller.signal.aborted)
                  emit({
                    type: 'error',
                    message: error instanceof Error ? error.message : String(error),
                  });
              } finally {
                res.end();
              }
            } else
              sendJson(res, 200, {
                result: await profile.backend.request(input as BackendRequest, controller.signal),
              });
          } finally {
            res.removeListener('close', abort);
          }
        }
      } catch (error) {
        if (!res.headersSent)
          sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
        else if (!res.destroyed) res.end();
      } finally {
        if (profile && id) {
          const current = profile,
            currentId = id;
          current.active--;
          if (!current.active)
            current.timer = setTimeout(() => {
              current.closing = (async () => {
                await current.backend.dispose();
                await current.storage.close();
              })().finally(() => profiles.delete(currentId));
              void current.closing.catch((error) => console.error(error));
            }, 300000).unref();
        }
      }
    });
    server.httpServer?.on('close', () => {
      for (const pending of profiles.values())
        void pending
          .then(async (profile) => {
            clearTimeout(profile.timer);
            await profile.backend.dispose();
            await profile.storage.close();
          })
          .catch(() => {});
    });
  };
  return { name: 'leaf-local-services', configureServer: install, configurePreviewServer: install };
}
export function mime(file: string) {
  const types: Record<string, string> = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return types[path.extname(file)] ?? 'application/octet-stream';
}

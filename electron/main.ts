import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  nativeTheme,
  safeStorage,
  screen,
  session,
  protocol,
  net,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { writeFile, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { release } from 'node:os';
import { existsSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { DesktopFile, BackendRequest, BackendEvent } from '@leaf/contracts/transport';
import type { Theme } from '@leaf/contracts/host';
import { readDocument, readFolder } from './platform/files.ts';
import { fileResponse, applicationFile } from './platform/resources.ts';
import { PluginInstaller } from './plugins/installer.ts';
import { CatalogService } from './plugins/catalog.ts';
import { officialCatalogSource } from './plugins/catalog-source.ts';
import { BackendManager } from './plugins/backend/manager.ts';
import { electronBackendProcess } from './plugins/backend/electron.ts';
import { CredentialVault } from './platform/credentials.ts';
import { applyBackdrop } from './platform/appearance.ts';
import { placeWindow, readWindowState, writeWindowState } from './platform/windowState.ts';
import { createStorage, type Storage } from './storage/client.ts';

const development = process.argv.includes('--dev');
// Automated runs render into a window that is never shown, so tests do not take over the desktop.
const hiddenWindow = process.env.LEAF_HIDDEN_WINDOW === '1';
// Electron's native Acrylic backdrop requires Windows 11 22H2 (build 22621).
const [windowsMajor, , windowsBuild] = release().split('.').map(Number);
const acrylic =
  process.platform === 'win32' &&
  (windowsMajor > 10 || (windowsMajor === 10 && windowsBuild >= 22621));
const translucent = process.platform === 'darwin' || acrylic;
let glassEnabled = translucent;
app.setName('Leaf');
const leafProfile = path.join(app.getPath('appData'), development ? 'Leaf Development' : 'Leaf');
app.setPath('userData', process.env.LEAF_USER_DATA || leafProfile);
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'leaf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);
const isInputFile = (file: string) =>
  !file.startsWith('-') && existsSync(file) && statSync(file).isFile();
let window: BrowserWindow | null = null;
let storage: Storage | undefined;
let backend: BackendManager | undefined;
let storageClosed = false;
let ready = false;
const pending: DesktopFile[] = [];
const MAX_BYTES = 512 * 1024 * 1024;
async function queueFile(file: string) {
  try {
    const data = await readDocument(file);
    if (ready && window) window.webContents.send('document:open', data);
    else pending.push(data);
  } catch (error) {
    dialog.showErrorBox('无法打开文件', (error as Error).message);
  }
}
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('open-file', (event, file) => {
    event.preventDefault();
    void queueFile(file);
  });
  app.on('second-instance', (_event, argv) => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
    argv.filter(isInputFile).forEach((file) => void queueFile(file));
  });
  app
    .whenReady()
    .then(async () => {
      const library = createStorage(
        path.join(app.getPath('userData'), 'reader/storage'),
        new URL(/* @vite-ignore */ './storage/worker.js', import.meta.url),
      );
      storage = library;
      const icon = path.join(
        import.meta.dirname,
        development ? '../public/icon.png' : '../dist/icon.png',
      );
      if (process.platform === 'darwin') {
        if (hiddenWindow) app.dock?.hide();
        // A packaged app shows its bundled ICNS; only the unbundled dev build needs the
        // Dock-shaped icon, which carries the margin and shadow of Apple's icon grid.
        else if (development)
          app.dock?.setIcon(path.join(import.meta.dirname, '../build/icon.png'));
      }
      session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
        callback(permission === 'clipboard-sanitized-write' && contents === window?.webContents),
      );
      const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');
      const savedWindow = readWindowState(windowStateFile);
      const win = new BrowserWindow({
        ...placeWindow(
          savedWindow,
          screen.getAllDisplays().map((display) => display.workArea),
        ),
        minWidth: 900,
        minHeight: 640,
        // Shown by revealWindow once the renderer has drawn the app, so launch never shows a blank page.
        show: false,
        paintWhenInitiallyHidden: true,
        backgroundColor: translucent ? '#00000000' : '#18181b',
        title: 'Leaf',
        icon,
        frame: process.platform !== 'win32',
        ...(acrylic ? { backgroundMaterial: 'acrylic' } : {}),
        ...(process.platform === 'darwin'
          ? {
              titleBarStyle: 'hiddenInset',
              trafficLightPosition: { x: 18, y: 17 },
              // The renderer keeps its chrome translucent so this material shows through.
              vibrancy: 'under-window',
              // followWindow paints the material flat grey whenever another app has focus.
              visualEffectState: 'active',
            }
          : {}),
        webPreferences: {
          additionalArguments: translucent ? ['--leaf-translucent-window'] : [],
          preload: path.join(import.meta.dirname, 'preload.cjs'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          // A hidden window would otherwise throttle timers and animation frames.
          backgroundThrottling: !hiddenWindow,
          webSecurity: true,
        },
      });
      window = win;
      const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
        event.sender === window?.webContents &&
        event.senderFrame === window?.webContents.mainFrame &&
        event.senderFrame?.url.split('#')[0] === 'leaf://app/index.html';
      const credentials = new CredentialVault(
        path.join(app.getPath('userData'), 'reader/credentials.json'),
        {
          encrypt(value) {
            if (!safeStorage.isEncryptionAvailable())
              throw new Error('系统钥匙串不可用，无法保存凭据');
            return safeStorage.encryptString(value).toString('base64');
          },
          decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
        },
      );
      const plugins = new PluginInstaller(
        path.join(app.getPath('userData'), 'reader/plugins'),
        library,
        (entry, name) =>
          `leaf://app/__leaf_plugins/${entry.manifest.id}/${entry.packageHash}/${name}`,
        async (id) => {
          await backend?.stop(id);
        },
      );
      backend = new BackendManager(
        plugins,
        library,
        credentials,
        () => electronBackendProcess(path.join(import.meta.dirname, 'plugins/backend/worker.js')),
        process.env,
      );
      const bundledDirectory = app.isPackaged
        ? path.join(process.resourcesPath, 'bundled-plugins')
        : path.join(import.meta.dirname, '../dist-plugins');
      const bundled = (await readdir(bundledDirectory))
        .filter((name) => name.endsWith('.leaf-plugin'))
        .map((name) => path.join(bundledDirectory, name));
      await plugins.initialize(
        bundled,
        process.env.LEAF_TEST_PLUGINS === 'all'
          ? bundled.map((file) => path.basename(file, '.leaf-plugin'))
          : ['leaf.pdf'],
      );
      protocol.handle('leaf', async (request) => {
        try {
          const url = new URL(request.url);
          if (url.hostname !== 'app' || request.method !== 'GET')
            return new Response('', { status: 403 });
          if (url.pathname.startsWith('/__leaf_plugins/')) {
            const [, , id, hash, ...parts] = url.pathname.split('/');
            return fileResponse(
              await plugins.resource(id, hash, parts.map(decodeURIComponent).join('/')),
            );
          }
          if (development) return net.fetch('http://127.0.0.1:5173' + url.pathname + url.search);
          return fileResponse(
            await applicationFile(
              path.join(import.meta.dirname, '../dist'),
              decodeURIComponent(url.pathname.slice(1) || 'index.html'),
            ),
          );
        } catch {
          return new Response('', { status: 404 });
        }
      });
      ipcMain.handle('storage:request', (event, operation, input) => {
        if (
          !trusted(event) ||
          ['plugins.bind', 'plugins.enable', 'plugins.remove'].includes(operation)
        )
          throw new Error('Unauthorized storage request');
        return library.requestRaw(operation, input);
      });
      const catalog = new CatalogService(
        path.join(app.getPath('userData'), 'reader/catalog.json'),
        officialCatalogSource,
        net.fetch,
      );
      const catalogRequests = new Map<string, AbortController>();
      ipcMain.handle('catalog:list', (event, refresh) => {
        if (!trusted(event) || (refresh !== undefined && typeof refresh !== 'boolean'))
          throw new Error('Unauthorized catalog request');
        return catalog.list(refresh);
      });
      ipcMain.handle('catalog:download', async (event, requestId, id, sha256) => {
        if (
          !trusted(event) ||
          typeof requestId !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(requestId) ||
          typeof id !== 'string' ||
          typeof sha256 !== 'string' ||
          catalogRequests.size ||
          catalogRequests.has(requestId)
        )
          throw new Error('Invalid catalog request');
        const controller = new AbortController();
        catalogRequests.set(requestId, controller);
        try {
          return await catalog.download(id, sha256, controller.signal, (progress) => {
            if (!win.webContents.isDestroyed())
              win.webContents.send('catalog:progress', requestId, progress);
          });
        } finally {
          catalogRequests.delete(requestId);
        }
      });
      ipcMain.on('catalog:cancel', (event, requestId) => {
        if (trusted(event)) catalogRequests.get(requestId)?.abort();
      });
      win.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace)
          for (const controller of catalogRequests.values()) controller.abort();
      });
      win.on('closed', () => {
        for (const controller of catalogRequests.values()) controller.abort();
      });
      ipcMain.handle('plugins:list', (event) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        return plugins.list();
      });
      ipcMain.handle('plugins:prepare', async (event, data?: Uint8Array) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        if (!data) {
          const result = await dialog.showOpenDialog(win, {
            title: '安装插件',
            properties: ['openFile'],
            filters: [{ name: 'Leaf 插件', extensions: ['leaf-plugin'] }],
          });
          if (result.canceled || !result.filePaths[0]) return null;
          const info = await stat(result.filePaths[0]);
          if (info.size > 64 * 1024 * 1024) throw new Error('插件包超过 64 MB');
          data = new Uint8Array(await readFile(result.filePaths[0]));
        }
        return { data, manifest: plugins.inspect(data) };
      });
      ipcMain.handle('plugins:install', (event, data: Uint8Array) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        return plugins.install(data);
      });
      ipcMain.handle('plugins:enable', (event, id, enabled) => {
        if (!trusted(event) || typeof enabled !== 'boolean')
          throw new Error('Unauthorized request');
        return plugins.enable(id, enabled);
      });
      ipcMain.handle('plugins:remove', (event, id) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        return plugins.remove(id);
      });
      const backendRequests = new Map<string, AbortController>();
      const controllerFor = (request: BackendRequest) => {
        if (
          !request?.requestId ||
          typeof request.requestId !== 'string' ||
          backendRequests.has(request.requestId)
        )
          throw new Error('Invalid task ID');
        const controller = new AbortController();
        backendRequests.set(request.requestId, controller);
        return controller;
      };
      ipcMain.handle('backend:request', async (event, request: BackendRequest) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        const controller = controllerFor(request);
        try {
          return await backend!.request(request, controller.signal);
        } finally {
          backendRequests.delete(request.requestId!);
        }
      });
      ipcMain.on('backend:cancel', (event, id) => {
        if (trusted(event)) backendRequests.get(id)?.abort();
      });
      ipcMain.on('backend:stream', (event, request: BackendRequest) => {
        const [port] = event.ports;
        if (!port) return;
        if (!trusted(event)) {
          port.close();
          return;
        }
        let controller: AbortController;
        try {
          controller = controllerFor(request);
        } catch (error) {
          port.postMessage({ type: 'error', message: String(error) });
          port.close();
          return;
        }
        port.on('message', ({ data }) => {
          if (data?.type === 'cancel') controller.abort();
        });
        port.on('close', () => controller.abort());
        port.start();
        const emit = (message: BackendEvent) => {
          if (!controller.signal.aborted) port.postMessage(message);
        };
        void backend!
          .stream(request, controller.signal, (value) => emit({ type: 'event', value }))
          .then(
            () => emit({ type: 'done' }),
            (error) =>
              emit({
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
              }),
          )
          .finally(() => {
            backendRequests.delete(request.requestId!);
            port.close();
          });
      });
      win.webContents.on('did-start-loading', () => {
        for (const controller of backendRequests.values()) controller.abort();
        backendRequests.clear();
      });
      let canClose = false;
      let closeRequest: { id: string; timer: NodeJS.Timeout } | undefined;
      let storageReady = false;
      win.webContents.on('did-start-loading', () => {
        storageReady = false;
      });
      win.webContents.on('render-process-gone', () => {
        storageReady = false;
      });
      ipcMain.on('storage:ready', (event) => {
        if (trusted(event)) storageReady = true;
      });
      ipcMain.on('storage:flushed', async (event, id, error) => {
        if (!trusted(event) || !closeRequest || closeRequest.id !== id) return;
        clearTimeout(closeRequest.timer);
        closeRequest = undefined;
        try {
          if (error) throw new Error(error);
          await library.request('flush', undefined);
          canClose = true;
          win.close();
        } catch (error) {
          window?.show();
          dialog.showErrorBox('书库尚未保存', (error as Error).message);
        }
      });
      let revealed = false;
      const revealWindow = () => {
        if (revealed || hiddenWindow) return;
        revealed = true;
        // Maximising while still hidden lets the window appear at its final size instead of growing.
        if (savedWindow?.maximized) win.maximize();
        win.show();
        if (savedWindow?.fullScreen) win.setFullScreen(true);
      };
      // Record the placement as the user asks to close; by the deferred close the window is hidden
      // and no longer reports whether it was maximised.
      win.on('close', () => {
        if (!canClose && !closeRequest) writeWindowState(windowStateFile, win);
      });
      win.on('close', (event) => {
        if (canClose || !storageReady || !ready) return;
        event.preventDefault();
        if (closeRequest) return;
        // Hiding rather than setEnabled(false): on macOS that attaches a sheet which lingers as a
        // second layer while the window closes.
        win.hide();
        const id = randomUUID();
        const timer = setTimeout(() => {
          closeRequest = undefined;
          window?.show();
          dialog.showErrorBox('书库尚未保存', '保存未完成，窗口已保留。请稍后重试。');
        }, 30000);
        closeRequest = { id, timer };
        win.webContents.send('storage:flush', id);
      });
      const updateBackdrop = () => {
        if (window)
          applyBackdrop(window, {
            platform: process.platform,
            supported: translucent,
            enabled: glassEnabled,
            dark: nativeTheme.shouldUseDarkColors,
          });
      };
      nativeTheme.on('updated', updateBackdrop);
      ipcMain.on('window:glass', (event, enabled) => {
        if (!trusted(event) || typeof enabled !== 'boolean' || !translucent) return;
        if (glassEnabled === enabled) return;
        glassEnabled = enabled;
        updateBackdrop();
      });
      const windowState = () => ({
        maximized: win.isMaximized(),
        fullscreen: win.isFullScreen(),
      });
      const sendWindowState = () => win.webContents.send('window:state', windowState());
      win.on('maximize', sendWindowState);
      win.on('unmaximize', sendWindowState);
      win.on('enter-full-screen', sendWindowState);
      win.on('leave-full-screen', sendWindowState);
      ipcMain.handle('window:state', (event) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        return windowState();
      });
      ipcMain.on('window:minimize', (event) => {
        if (trusted(event)) win.minimize();
      });
      ipcMain.on('window:toggle-maximize', (event) => {
        if (!trusted(event)) return;
        if (win.isFullScreen()) win.setFullScreen(false);
        else if (win.isMaximized()) win.unmaximize();
        else win.maximize();
      });
      ipcMain.on('window:close', (event) => {
        if (trusted(event)) win.close();
      });
      ipcMain.handle('documents:choose', async (event, extensions: string[]) => {
        if (
          !trusted(event) ||
          !Array.isArray(extensions) ||
          extensions.some((value) => typeof value !== 'string' || !/^[a-z0-9]{1,16}$/i.test(value))
        )
          throw new Error('Unauthorized request');
        const result = await dialog.showOpenDialog(win, {
          title: '导入文档',
          properties: ['openFile', 'multiSelections'],
          filters: extensions.length
            ? [{ name: '阅读文档', extensions }]
            : [{ name: '文档', extensions: ['*'] }],
        });
        if (result.canceled) return null;
        return Promise.all(result.filePaths.map(readDocument));
      });
      ipcMain.handle('folder:choose', async (event) => {
        if (!trusted(event)) throw new Error('Unauthorized request');
        const result = await dialog.showOpenDialog(win, {
          title: '导入文档文件夹',
          properties: ['openDirectory'],
        });
        if (result.canceled || !result.filePaths[0]) return null;
        return readFolder(result.filePaths[0]);
      });
      ipcMain.handle('link:open', async (event, value) => {
        if (!trusted(event) || typeof value !== 'string') throw new Error('Invalid link');
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported link');
        await shell.openExternal(url.href);
      });
      ipcMain.handle('file:save', async (event, name, data) => {
        if (
          !trusted(event) ||
          typeof name !== 'string' ||
          !(data instanceof Uint8Array) ||
          data.byteLength > MAX_BYTES
        )
          throw new Error('Invalid file');
        const extension = path.extname(name).slice(1);
        if (!/^[a-z0-9]{1,24}$/i.test(extension)) throw new Error('Invalid file extension');
        const result = await dialog.showSaveDialog(win, {
          defaultPath: path.basename(name),
          filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
        });
        if (result.canceled || !result.filePath) return false;
        await writeFile(result.filePath, data);
        return true;
      });
      ipcMain.on('theme:set', (event, theme) => {
        if (!trusted(event)) return;
        if (!['light', 'dark', 'system'].includes(theme))
          throw new Error(`Unknown theme: ${theme}`);
        nativeTheme.themeSource = theme as Theme;
        updateBackdrop();
      });
      ipcMain.on('renderer:ready', (event) => {
        if (!trusted(event)) return;
        ready = true;
        revealWindow();
        pending.splice(0).forEach((data) => win.webContents.send('document:open', data));
      });
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event, url) => {
        const current = win.webContents.getURL();
        if (url !== current) event.preventDefault();
      });
      const appMenu: MenuItemConstructorOptions[] =
        process.platform === 'darwin'
          ? [
              {
                label: 'Leaf',
                submenu: [
                  { role: 'about' },
                  { type: 'separator' },
                  { role: 'hide' },
                  { role: 'hideOthers' },
                  { role: 'unhide' },
                  { type: 'separator' },
                  { role: 'quit' },
                ],
              },
            ]
          : [];
      const devTools: MenuItemConstructorOptions[] = development
        ? [{ role: 'toggleDevTools' }]
        : [];
      const menu: MenuItemConstructorOptions[] = [
        ...appMenu,
        {
          label: '文件',
          submenu: [
            {
              label: '打开文档…',
              accelerator: 'CmdOrCtrl+O',
              click: () => win.webContents.send('menu:open'),
            },
            {
              label: '导入文件夹…',
              click: () => win.webContents.send('menu:open-folder'),
            },
            { type: 'separator' },
            { role: process.platform === 'darwin' ? 'close' : 'quit' },
          ],
        },
        {
          label: '编辑',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: '视图',
          submenu: [{ role: 'togglefullscreen' }, ...devTools],
        },
      ];
      Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
      if (process.platform === 'win32') win.setMenuBarVisibility(false);
      await win.loadURL('leaf://app/index.html');
      process.argv
        .slice(1)
        .filter(isInputFile)
        .forEach((file) => void queueFile(file));
      win.on('closed', () => {
        window = null;
        ready = false;
      });
    })
    .catch(async (error: unknown) => {
      dialog.showErrorBox('无法启动 Leaf', error instanceof Error ? error.message : String(error));
      window?.destroy();
      try {
        await backend?.dispose();
      } finally {
        await storage?.close();
        storageClosed = true;
        app.quit();
      }
    });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (storageClosed || !storage) return;
    event.preventDefault();
    if (window) {
      window.close();
      return;
    }
    void (async () => {
      await backend?.dispose();
      await storage?.close();
    })()
      .catch((error) => console.error(error))
      .finally(() => {
        storageClosed = true;
        app.quit();
      });
  });
}

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
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { release } from 'node:os';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { DesktopFile, Theme } from './contract.ts';
import { isDocument, readDocument, readFolder } from './import.ts';
import { applyBackdrop } from './appearance.ts';
import { placeWindow, readWindowState, writeWindowState } from './windowState.ts';
import { createStorage, type Storage } from './storage/client.ts';
import { createAiService } from './ai/service.ts';

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
const legacyProfile = path.join(app.getPath('appData'), 'Folio');
// Reuse the existing profile so a renamed app retains its library and annotations.
app.setPath(
  'userData',
  process.env.LEAF_USER_DATA ||
    (!development && !existsSync(leafProfile) && existsSync(legacyProfile)
      ? legacyProfile
      : leafProfile),
);
let window: BrowserWindow | null = null;
let storage: Storage | undefined;
let storageClosed = false;
let ready = false;
const pending: DesktopFile[] = [];
const MAX_BYTES = 512 * 1024 * 1024;
async function queueFile(file: string) {
  try {
    const data = await readDocument(file);
    if (ready && window) window.webContents.send('pdf:open', data);
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
    argv.filter(isDocument).forEach((file) => void queueFile(file));
  });
  app.whenReady().then(() => {
    const library = createStorage(path.join(app.getPath('userData'), 'library'));
    storage = library;
    const icon = path.join(
      import.meta.dirname,
      development ? '../public/icon.png' : '../dist/icon.png',
    );
    if (process.platform === 'darwin') {
      if (hiddenWindow) app.dock?.hide();
      // A packaged app shows its bundled ICNS; only the unbundled dev build needs the
      // Dock-shaped icon, which carries the margin and shadow of Apple's icon grid.
      else if (development) app.dock?.setIcon(path.join(import.meta.dirname, '../build/icon.png'));
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
      (development
        ? event.senderFrame?.url.startsWith('http://127.0.0.1:5173/')
        : event.senderFrame?.url.split('#')[0] ===
          pathToFileURL(path.join(import.meta.dirname, '../dist/index.html')).href);
    ipcMain.handle('storage:request', (event, operation, input) => {
      if (!trusted(event)) throw new Error('Unauthorized storage request');
      return library.request(operation, input);
    });
    const ai = createAiService({
      file: path.join(app.getPath('userData'), 'ai.json'),
      cipher: {
        encrypt(text) {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error('系统钥匙串不可用，无法保存 API Key');
          return safeStorage.encryptString(text).toString('base64');
        },
        decrypt: (text) => safeStorage.decryptString(Buffer.from(text, 'base64')),
      },
      env: process.env,
    });
    ipcMain.handle('ai:config', (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      return ai.summary();
    });
    ipcMain.handle('ai:configure', (event, input) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      return ai.configure(input);
    });
    // Each conversation turn owns a MessagePort: events stream back on it, and closing it cancels.
    ipcMain.on('ai:chat', (event, request) => {
      const [port] = event.ports;
      if (!port) return;
      if (!trusted(event)) {
        port.close();
        return;
      }
      const controller = new AbortController();
      port.on('message', ({ data }) => {
        if (data?.type === 'cancel') controller.abort();
      });
      port.on('close', () => controller.abort());
      port.start();
      void ai
        .chat(request, controller.signal, (message) => port.postMessage(message))
        .finally(() => port.close());
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
        await library.request('flush');
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
      if (canClose || !storageReady) return;
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
    ipcMain.handle('pdf:choose', async (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      const result = await dialog.showOpenDialog(win, {
        title: '导入 PDF 或 Markdown',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '阅读文档', extensions: ['pdf', 'md', 'markdown'] }],
      });
      if (result.canceled) return null;
      return Promise.all(result.filePaths.map(readDocument));
    });
    ipcMain.handle('folder:choose', async (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      const result = await dialog.showOpenDialog(win, {
        title: '导入 Markdown 文件夹',
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
      if (!['pdf', 'md', 'json'].includes(extension)) throw new Error('Unsupported file type');
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
      if (!['light', 'dark', 'system'].includes(theme)) throw new Error(`Unknown theme: ${theme}`);
      nativeTheme.themeSource = theme as Theme;
      updateBackdrop();
    });
    ipcMain.on('renderer:ready', (event) => {
      if (!trusted(event)) return;
      ready = true;
      revealWindow();
      pending.splice(0).forEach((data) => win.webContents.send('pdf:open', data));
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
    const devTools: MenuItemConstructorOptions[] = development ? [{ role: 'toggleDevTools' }] : [];
    const menu: MenuItemConstructorOptions[] = [
      ...appMenu,
      {
        label: '文件',
        submenu: [
          {
            label: '打开 PDF 或 Markdown…',
            accelerator: 'CmdOrCtrl+O',
            click: () => win.webContents.send('menu:open'),
          },
          {
            label: '导入 Markdown 文件夹…',
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
    if (development) win.loadURL('http://127.0.0.1:5173');
    else win.loadFile(path.join(import.meta.dirname, '../dist/index.html'));
    process.argv
      .slice(1)
      .filter(isDocument)
      .forEach((file) => void queueFile(file));
    win.on('closed', () => {
      window = null;
      ready = false;
    });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (storageClosed || !storage) return;
    event.preventDefault();
    if (window) {
      window.close();
      return;
    }
    void storage
      .close()
      .catch((error) => console.error(error))
      .finally(() => {
        storageClosed = true;
        app.quit();
      });
  });
}

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  nativeTheme,
  session,
  shell,
} = require('electron');
const { writeFile } = require('node:fs/promises');
const { isDocument, readDocument, readFolder } = require('./import.cjs');
const { applyBackdrop } = require('./appearance.cjs');
const path = require('node:path');
const { release } = require('node:os');
const { existsSync } = require('node:fs');
const development = process.argv.includes('--dev');
// Electron's native Acrylic backdrop requires Windows 11 22H2 (build 22621).
const [windowsMajor, , windowsBuild] = release().split('.').map(Number);
const acrylic =
  process.platform === 'win32' &&
  (windowsMajor > 10 || (windowsMajor === 10 && windowsBuild >= 22621));
const translucent = process.platform === 'darwin' || acrylic;
let glassEnabled = translucent;
app.setName('Leaf');
const leafProfile = path.join(app.getPath('appData'), 'Leaf');
const legacyProfile = path.join(app.getPath('appData'), 'Folio');
// Reuse the existing profile so a renamed app retains its library and annotations.
app.setPath(
  'userData',
  process.env.LEAF_USER_DATA ||
    (!existsSync(leafProfile) && existsSync(legacyProfile) ? legacyProfile : leafProfile),
);
let window;
let ready = false;
const pending = [];
const MAX_BYTES = 512 * 1024 * 1024;
async function queueFile(file) {
  try {
    const data = await readDocument(file);
    if (ready && window) window.webContents.send('pdf:open', data);
    else pending.push(data);
  } catch (error) {
    dialog.showErrorBox('无法打开文件', error.message);
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
    const icon = path.join(__dirname, development ? '../public/icon.png' : '../dist/icon.png');
    if (process.platform === 'darwin') app.dock.setIcon(icon);
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
      callback(permission === 'clipboard-sanitized-write' && contents === window?.webContents),
    );
    window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 900,
      minHeight: 640,
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
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
    const trusted = (event) =>
      event.sender === window?.webContents &&
      (development
        ? event.senderFrame?.url.startsWith('http://127.0.0.1:5173/')
        : event.senderFrame?.url.startsWith('file://'));
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
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen(),
    });
    const sendWindowState = () => window.webContents.send('window:state', windowState());
    for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'])
      window.on(event, sendWindowState);
    ipcMain.handle('window:state', (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      return windowState();
    });
    ipcMain.on('window:minimize', (event) => {
      if (trusted(event)) window.minimize();
    });
    ipcMain.on('window:toggle-maximize', (event) => {
      if (!trusted(event)) return;
      if (window.isFullScreen()) window.setFullScreen(false);
      else if (window.isMaximized()) window.unmaximize();
      else window.maximize();
    });
    ipcMain.on('window:close', (event) => {
      if (trusted(event)) window.close();
    });
    ipcMain.handle('pdf:choose', async (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      const result = await dialog.showOpenDialog(window, {
        title: '导入 PDF 或 Markdown',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '阅读文档', extensions: ['pdf', 'md', 'markdown'] }],
      });
      if (result.canceled) return null;
      return Promise.all(result.filePaths.map(readDocument));
    });
    ipcMain.handle('folder:choose', async (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      const result = await dialog.showOpenDialog(window, {
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
      const result = await dialog.showSaveDialog(window, {
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
      nativeTheme.themeSource = theme;
      updateBackdrop();
    });
    ipcMain.on('renderer:ready', (event) => {
      if (!trusted(event)) return;
      ready = true;
      pending.splice(0).forEach((data) => window.webContents.send('pdf:open', data));
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      const current = window.webContents.getURL();
      if (url !== current) event.preventDefault();
    });
    const menu = [
      ...(process.platform === 'darwin'
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
        : []),
      {
        label: '文件',
        submenu: [
          {
            label: '打开 PDF 或 Markdown…',
            accelerator: 'CmdOrCtrl+O',
            click: () => window.webContents.send('menu:open'),
          },
          {
            label: '导入 Markdown 文件夹…',
            click: () => window.webContents.send('menu:open-folder'),
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
        submenu: [
          { role: 'togglefullscreen' },
          ...(development ? [{ role: 'toggleDevTools' }] : []),
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
    if (process.platform === 'win32') window.setMenuBarVisibility(false);
    if (development) window.loadURL('http://127.0.0.1:5173');
    else window.loadFile(path.join(__dirname, '../dist/index.html'));
    process.argv
      .slice(1)
      .filter(isDocument)
      .forEach((file) => void queueFile(file));
    window.on('closed', () => {
      window = null;
      ready = false;
    });
  });
  app.on('window-all-closed', () => app.quit());
}

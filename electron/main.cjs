const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require('electron');
const { readFile, writeFile, stat } = require('node:fs/promises');
const path = require('node:path');
const development = process.argv.includes('--dev');
if (process.env.FOLIO_USER_DATA) app.setPath('userData', process.env.FOLIO_USER_DATA);
let window;
let ready = false;
const pending = [];
const MAX_BYTES = 512 * 1024 * 1024;
async function readPDF(file) {
  if (path.extname(file).toLowerCase() !== '.pdf') throw new Error('请选择 PDF 文件');
  const info = await stat(file);
  if (info.size > MAX_BYTES) throw new Error('PDF 超过 512 MB，请使用较小文件');
  return { name: path.basename(file), data: new Uint8Array(await readFile(file)) };
}
async function queueFile(file) {
  try {
    const data = await readPDF(file);
    if (ready && window) window.webContents.send('pdf:open', data);
    else pending.push(data);
  } catch (error) {
    dialog.showErrorBox('无法打开 PDF', error.message);
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
    argv
      .filter((arg) => arg.toLowerCase().endsWith('.pdf'))
      .forEach((file) => void queueFile(file));
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
      backgroundColor: '#18181b',
      title: 'Folio',
      icon,
      ...(process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 17 } }
        : {}),
      webPreferences: {
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
    ipcMain.handle('pdf:choose', async (event) => {
      if (!trusted(event)) throw new Error('Unauthorized request');
      const result = await dialog.showOpenDialog(window, {
        title: '导入 PDF',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled) return null;
      return Promise.all(result.filePaths.map(readPDF));
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
              label: 'Folio',
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
            label: '打开 PDF…',
            accelerator: 'CmdOrCtrl+O',
            click: () => window.webContents.send('menu:open'),
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
    if (development) window.loadURL('http://127.0.0.1:5173');
    else window.loadFile(path.join(__dirname, '../dist/index.html'));
    process.argv
      .slice(1)
      .filter((arg) => arg.toLowerCase().endsWith('.pdf'))
      .forEach((file) => void queueFile(file));
    window.on('closed', () => {
      window = null;
      ready = false;
    });
  });
  app.on('window-all-closed', () => app.quit());
}

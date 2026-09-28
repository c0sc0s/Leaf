const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  translucent: process.argv.includes('--leaf-translucent-window'),
  openPDF: () => ipcRenderer.invoke('pdf:choose'),
  openFolder: () => ipcRenderer.invoke('folder:choose'),
  openExternal: (url) => ipcRenderer.invoke('link:open', url),
  saveFile: (name, data) => ipcRenderer.invoke('file:save', name, data),
  ready: () => ipcRenderer.send('renderer:ready'),
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  setFrostedGlass: (enabled) => ipcRenderer.send('window:glass', enabled),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  onWindowState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
  onOpenFile: (callback) => {
    const open = (_event, file) => callback(file);
    const menu = () => window.dispatchEvent(new Event('leaf:open'));
    const folder = () => window.dispatchEvent(new Event('leaf:open-folder'));
    ipcRenderer.on('pdf:open', open);
    ipcRenderer.on('menu:open', menu);
    ipcRenderer.on('menu:open-folder', folder);
    return () => {
      ipcRenderer.removeListener('pdf:open', open);
      ipcRenderer.removeListener('menu:open', menu);
      ipcRenderer.removeListener('menu:open-folder', folder);
    };
  },
});

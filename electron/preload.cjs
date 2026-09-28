const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  openPDF: () => ipcRenderer.invoke('pdf:choose'),
  saveFile: (name, data) => ipcRenderer.invoke('file:save', name, data),
  ready: () => ipcRenderer.send('renderer:ready'),
  onOpenFile: (callback) => {
    const open = (_event, file) => callback(file);
    const menu = () => window.dispatchEvent(new Event('leaf:open'));
    ipcRenderer.on('pdf:open', open);
    ipcRenderer.on('menu:open', menu);
    return () => {
      ipcRenderer.removeListener('pdf:open', open);
      ipcRenderer.removeListener('menu:open', menu);
    };
  },
});

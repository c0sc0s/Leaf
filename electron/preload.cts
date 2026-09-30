// Sandboxed preloads must be CommonJS and may only require `electron`.
import type { ChatEvent, DesktopAPI, DesktopFile, WindowState } from './contract.ts';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const desktop: DesktopAPI = {
  storage: {
    request: (operation, input) => ipcRenderer.invoke('storage:request', operation, input),
    onBeforeClose: (callback) => {
      const listener = async (_event: unknown, id: string) => {
        try {
          await callback();
          ipcRenderer.send('storage:flushed', id);
        } catch (error) {
          ipcRenderer.send(
            'storage:flushed',
            id,
            String((error as Error | undefined)?.message || error),
          );
        }
      };
      ipcRenderer.on('storage:flush', listener);
      ipcRenderer.send('storage:ready');
      return () => ipcRenderer.removeListener('storage:flush', listener);
    },
  },
  ai: {
    config: () => ipcRenderer.invoke('ai:config'),
    configure: (input) => ipcRenderer.invoke('ai:configure', input),
    chat: (request, onEvent) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = ({ data }: MessageEvent<ChatEvent>) => onEvent(data);
      ipcRenderer.postMessage('ai:chat', request, [port2]);
      return () => {
        port1.postMessage({ type: 'cancel' });
        port1.close();
      };
    },
  },
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
    const listener = (_event: unknown, state: WindowState) => callback(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
  onOpenFile: (callback) => {
    const open = (_event: unknown, file: DesktopFile) => callback(file);
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
};

contextBridge.exposeInMainWorld('desktop', desktop);

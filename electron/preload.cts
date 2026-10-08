// Sandboxed preloads must be CommonJS and may only require `electron`.
import type {
  BackendEvent,
  BackendRequest,
  DesktopAPI,
  DesktopFile,
  WindowState,
  UpdateState,
} from '@leaf/contracts/transport';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const desktop: DesktopAPI = {
  updates: {
    getState: () => ipcRenderer.invoke('updates:state'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    openRelease: () => ipcRenderer.invoke('updates:open-release'),
    subscribe: (callback) => {
      const listener = (_event: unknown, state: UpdateState) => callback(state);
      ipcRenderer.on('updates:state', listener);
      return () => ipcRenderer.removeListener('updates:state', listener);
    },
  },
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
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    prepare: (data) => ipcRenderer.invoke('plugins:prepare', data),
    install: (data) => ipcRenderer.invoke('plugins:install', data),
    enable: (id, enabled) => ipcRenderer.invoke('plugins:enable', id, enabled),
    remove: (id) => ipcRenderer.invoke('plugins:remove', id),
  },
  backend: {
    request: (input: BackendRequest) => ipcRenderer.invoke('backend:request', input),
    cancel: (id) => ipcRenderer.send('backend:cancel', id),
    stream: (request, onEvent) => {
      const { port1, port2 } = new MessageChannel();
      port1.onmessage = ({ data }: MessageEvent<BackendEvent>) => onEvent(data);
      ipcRenderer.postMessage('backend:stream', request, [port2]);
      let closed = false;
      return () => {
        if (closed) return;
        closed = true;
        port1.postMessage({ type: 'cancel' });
        port1.close();
      };
    },
  },
  platform: process.platform,
  translucent: process.argv.includes('--leaf-translucent-window'),
  openDocuments: (extensions) => ipcRenderer.invoke('documents:choose', extensions),
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
    ipcRenderer.on('document:open', open);
    ipcRenderer.on('menu:open', menu);
    ipcRenderer.on('menu:open-folder', folder);
    return () => {
      ipcRenderer.removeListener('document:open', open);
      ipcRenderer.removeListener('menu:open', menu);
      ipcRenderer.removeListener('menu:open-folder', folder);
    };
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);

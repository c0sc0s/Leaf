import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { app, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import electronUpdater from 'electron-updater';
import { build } from '../../package.json';
import { UpdateService } from './updater.ts';

export async function createUpdater(disabled: boolean, prepareInstall: () => Promise<void>) {
  let installMode: 'automatic' | 'manual' | 'disabled' = 'automatic';
  let reason: string | null = null;
  if (disabled || !app.isPackaged) {
    installMode = 'disabled';
    reason = '当前运行环境不检查在线更新';
  } else if (!['darwin', 'win32'].includes(process.platform)) {
    installMode = 'disabled';
    reason = '当前平台暂不支持在线更新';
  } else if (process.platform === 'darwin') {
    const bundle = path.resolve(path.dirname(process.execPath), '../..');
    const signature = await promisify(execFile)(
      '/usr/bin/codesign',
      ['-dv', '--verbose=4', bundle],
      {
        timeout: 5000,
      },
    ).then(
      (result) => result.stderr,
      () => '',
    );
    if (!/^Authority=Developer ID Application:/m.test(signature)) {
      installMode = 'manual';
      reason = '此安装包支持检查更新，请从发布页面下载安装新版本';
    }
  }
  const { autoUpdater } = electronUpdater;
  return new UpdateService(
    autoUpdater,
    { currentVersion: app.getVersion(), installMode, reason },
    `https://github.com/${build.publish.owner}/${build.publish.repo}/releases`,
    prepareInstall,
  );
}

export function attachUpdater(
  updater: UpdateService,
  window: BrowserWindow,
  trusted: (event: IpcMainInvokeEvent) => boolean,
  recoverInstall: () => void,
) {
  const unsubscribe = updater.subscribe((state) => {
    if (state.error) recoverInstall();
    if (!window.isDestroyed()) window.webContents.send('updates:state', state);
  });
  ipcMain.handle('updates:state', (event) => {
    if (!trusted(event)) throw new Error('Unauthorized update request');
    return updater.getState();
  });
  for (const operation of ['check', 'download', 'install'] as const) {
    ipcMain.handle(`updates:${operation}`, (event) => {
      if (!trusted(event)) throw new Error('Unauthorized update request');
      return updater[operation]();
    });
  }
  ipcMain.handle('updates:open-release', (event) => {
    if (!trusted(event)) throw new Error('Unauthorized update request');
    return shell.openExternal(updater.releaseURL());
  });
  let timer: NodeJS.Timeout | undefined;
  let interval: NodeJS.Timeout | undefined;
  let started = false;
  const check = () => {
    void updater
      .check()
      .catch((error: unknown) => console.warn('[Leaf] Update check failed:', error));
  };
  app.once('will-quit', () => {
    clearTimeout(timer);
    clearInterval(interval);
    unsubscribe();
    updater.dispose();
  });
  return () => {
    if (started || updater.getState().status === 'disabled') return;
    started = true;
    timer = setTimeout(check, 15000);
    interval = setInterval(check, 6 * 60 * 60 * 1000);
  };
}

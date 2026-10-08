import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateCheckResult, UpdateInfo } from 'electron-updater';
import { UpdateService } from '../../../../electron/platform/updater.ts';
import { deferred } from '../../../fixtures/deferred.ts';

const info: UpdateInfo = {
  version: '1.6.0',
  releaseDate: '2026-10-08T00:00:00Z',
  files: [],
  releaseNotes: '更好的阅读体验',
  path: '',
  sha512: '',
};
const result = (available = true): UpdateCheckResult => ({
  isUpdateAvailable: available,
  updateInfo: info,
  versionInfo: info,
});

class Driver extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  allowDowngrade = true;
  checkForUpdates = vi.fn(async (): Promise<UpdateCheckResult | null> => result());
  downloadUpdate = vi.fn(async () => {
    this.emit('download-progress', { percent: 45 });
    this.emit('update-downloaded', info);
    return ['update.zip'];
  });
  quitAndInstall = vi.fn();
}

function fixture(mode: 'automatic' | 'manual' | 'disabled' = 'automatic') {
  const driver = new Driver();
  const prepare = vi.fn(async () => {});
  const service = new UpdateService(
    driver,
    {
      currentVersion: '1.5.2',
      installMode: mode,
      reason: null,
    },
    'https://github.com/c0sc0s/Leaf/releases',
    prepare,
  );
  return { driver, prepare, service };
}

describe('desktop updates', () => {
  it('checks without downloading and requires a completed download before installation', async () => {
    const { driver, service } = fixture();
    expect(driver.autoDownload).toBe(false);
    expect(driver.autoInstallOnAppQuit).toBe(false);
    expect(driver.allowPrerelease).toBe(false);
    expect(driver.allowDowngrade).toBe(false);
    await expect(service.install()).rejects.toThrow('尚未下载');
    await service.check();
    expect(service.getState()).toMatchObject({
      status: 'available',
      release: {
        version: '1.6.0',
        notes: '更好的阅读体验',
        url: 'https://github.com/c0sc0s/Leaf/releases/tag/v1.6.0',
      },
    });
    expect(driver.downloadUpdate).not.toHaveBeenCalled();
    const states: string[] = [];
    service.subscribe((state) => states.push(`${state.status}:${state.progress}`));
    await service.download();
    expect(states).toEqual(['downloading:0', 'downloading:45', 'downloaded:100']);
    await service.check();
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(service.getState().status).toBe('downloaded');
  });

  it('shares in-flight checks and downloads without starting conflicting work', async () => {
    const { driver, service } = fixture();
    const check = deferred<UpdateCheckResult>();
    driver.checkForUpdates.mockReturnValue(check.promise);
    const first = service.check();
    expect(service.check()).toBe(first);
    expect(service.download()).toBe(first);
    check.resolve(result());
    await first;
    expect(driver.checkForUpdates).toHaveBeenCalledTimes(1);
    const download = deferred<string[]>();
    driver.downloadUpdate.mockReturnValue(download.promise);
    const downloading = service.download();
    expect(service.download()).toBe(downloading);
    expect(service.check()).toBe(downloading);
    download.resolve([]);
    await downloading;
    expect(driver.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it('allows retry after network or download failures', async () => {
    const { driver, service } = fixture();
    driver.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    await expect(service.check()).rejects.toThrow('offline');
    expect(service.getState()).toMatchObject({ status: 'error', error: 'offline' });
    await service.check();
    driver.downloadUpdate.mockRejectedValueOnce(new Error('checksum mismatch'));
    await expect(service.download()).rejects.toThrow('checksum mismatch');
    expect(service.getState().release?.version).toBe('1.6.0');
    await service.download();
    expect(service.getState()).toMatchObject({ status: 'downloaded', error: null });
  });

  it('does not treat an early downloaded event as success when staging later fails', async () => {
    const { driver, service } = fixture();
    await service.check();
    driver.downloadUpdate.mockImplementationOnce(async () => {
      driver.emit('update-downloaded', info);
      throw new Error('staging failed');
    });
    await expect(service.download()).rejects.toThrow('staging failed');
    expect(service.getState()).toMatchObject({ status: 'error', error: 'staging failed' });
    await expect(service.install()).rejects.toThrow('尚未下载');
  });

  it('never installs before saving and retains the download when saving fails', async () => {
    const { driver, prepare, service } = fixture();
    await service.check();
    await service.download();
    prepare.mockRejectedValueOnce(new Error('笔记未保存'));
    await expect(service.install()).rejects.toThrow('笔记未保存');
    expect(service.getState()).toMatchObject({ status: 'downloaded', error: '笔记未保存' });
    expect(driver.quitAndInstall).not.toHaveBeenCalled();
    const save = deferred<void>();
    prepare.mockReturnValueOnce(save.promise);
    const installing = service.install();
    expect(service.install()).toBe(installing);
    await Promise.resolve();
    expect(service.getState().status).toBe('installing');
    expect(driver.quitAndInstall).not.toHaveBeenCalled();
    save.resolve();
    await installing;
    expect(driver.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
  });

  it('restores a retryable download on native installation failure', async () => {
    const { driver, service } = fixture();
    await service.check();
    await service.download();
    driver.quitAndInstall.mockImplementationOnce(() =>
      driver.emit('error', new Error('installer failed')),
    );
    await expect(service.install()).rejects.toThrow('installer failed');
    expect(service.getState()).toMatchObject({ status: 'downloaded', error: 'installer failed' });
    await service.install();
    expect(driver.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it('supports manual downloads for unsigned macOS and disables network checks in development', async () => {
    const manual = fixture('manual');
    await manual.service.check();
    await expect(manual.service.download()).rejects.toThrow('发布页面');
    expect(manual.driver.downloadUpdate).not.toHaveBeenCalled();
    const disabled = fixture('disabled');
    await disabled.service.check();
    expect(disabled.driver.checkForUpdates).not.toHaveBeenCalled();
    expect(disabled.service.getState().status).toBe('disabled');
  });

  it('clears obsolete release data when already current and removes subscriptions on disposal', async () => {
    const { driver, service } = fixture();
    await service.check();
    driver.checkForUpdates.mockResolvedValueOnce(result(false));
    await service.check();
    expect(service.getState()).toMatchObject({ status: 'current', release: null });
    expect(service.releaseURL()).toBe('https://github.com/c0sc0s/Leaf/releases/latest');
    service.dispose();
    expect(driver.listenerCount('download-progress')).toBe(0);
    expect(driver.listenerCount('update-downloaded')).toBe(0);
    expect(driver.listenerCount('error')).toBe(0);
  });
});

import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';
import type { AppUpdaterEvents } from 'electron-updater/out/AppUpdater';
import type { UpdateState } from '@leaf/contracts/transport';

export type UpdateDriver = Pick<
  AppUpdater,
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'allowDowngrade'
  | 'checkForUpdates'
  | 'downloadUpdate'
  | 'quitAndInstall'
> & {
  on<E extends keyof AppUpdaterEvents>(event: E, listener: AppUpdaterEvents[E]): unknown;
  removeListener<E extends keyof AppUpdaterEvents>(
    event: E,
    listener: AppUpdaterEvents[E],
  ): unknown;
};

export class UpdateService {
  private state: UpdateState;
  private pending?: Promise<void>;
  private listeners = new Set<(state: UpdateState) => void>();
  private removers: (() => void)[] = [];
  private driver: UpdateDriver;
  private releasesURL: string;
  private prepareInstall: () => Promise<void>;

  constructor(
    driver: UpdateDriver,
    options: Pick<UpdateState, 'currentVersion' | 'installMode' | 'reason'>,
    releasesURL: string,
    prepareInstall: () => Promise<void>,
  ) {
    this.driver = driver;
    this.releasesURL = releasesURL;
    this.prepareInstall = prepareInstall;
    this.state = {
      ...options,
      status: options.installMode === 'disabled' ? 'disabled' : 'idle',
      release: null,
      progress: null,
      error: null,
    };
    driver.autoDownload = false;
    driver.autoInstallOnAppQuit = false;
    driver.allowPrerelease = false;
    driver.allowDowngrade = false;
    this.listen('download-progress', (progress: ProgressInfo) => {
      if (this.state.status === 'downloading')
        this.set({ progress: Math.max(0, Math.min(100, progress.percent)) });
    });
    this.listen('update-downloaded', () => {
      if (this.state.status === 'downloading') this.set({ status: 'downloaded', progress: 100 });
    });
    // Native installers can report errors after quitAndInstall has returned.
    this.listen('error', (error: Error) => this.fail(error));
  }

  private listen<E extends keyof AppUpdaterEvents>(event: E, listener: AppUpdaterEvents[E]) {
    this.driver.on(event, listener);
    this.removers.push(() => this.driver.removeListener(event, listener));
  }

  getState(): UpdateState {
    return structuredClone(this.state);
  }

  subscribe(listener: (state: UpdateState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  releaseURL() {
    return this.state.release?.url ?? `${this.releasesURL}/latest`;
  }

  check(): Promise<void> {
    if (this.state.status === 'disabled' || this.pending) return this.pending ?? Promise.resolve();
    if (['downloaded', 'installing'].includes(this.state.status)) return Promise.resolve();
    return this.run(async () => {
      this.set({ status: 'checking', error: null, progress: null });
      const result = await this.driver.checkForUpdates();
      if (!result) throw new Error('当前安装包不支持检查更新');
      this.set({
        status: result.isUpdateAvailable ? 'available' : 'current',
        release: result.isUpdateAvailable ? this.release(result.updateInfo) : null,
      });
    });
  }

  download(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.state.installMode !== 'automatic' || !this.state.release)
      return Promise.reject(new Error('请从发布页面下载安装新版本'));
    if (this.state.status === 'downloaded') return Promise.resolve();
    if (!['available', 'error'].includes(this.state.status))
      return Promise.reject(new Error('请先检查更新'));
    return this.run(async () => {
      this.set({ status: 'downloading', error: null, progress: 0 });
      await this.driver.downloadUpdate();
    });
  }

  install(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.state.status === 'installing') return Promise.resolve();
    if (this.state.status !== 'downloaded' || this.state.installMode !== 'automatic')
      return Promise.reject(new Error('更新尚未下载完成'));
    return this.run(async () => {
      this.set({ status: 'installing', error: null });
      try {
        await this.prepareInstall();
      } catch (error) {
        this.set({ status: 'downloaded', error: this.message(error) });
        throw error;
      }
      this.driver.quitAndInstall(false, true);
      if (this.state.error) throw new Error(this.state.error);
    });
  }

  private run(operation: () => Promise<void>): Promise<void> {
    const pending = Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        if (this.state.status !== 'downloaded' || !this.state.error) this.fail(error);
        throw error;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return pending;
  }

  private release(info: UpdateInfo) {
    const notes =
      typeof info.releaseNotes === 'string'
        ? info.releaseNotes
        : (info.releaseNotes ?? [])
            .map((entry) => `${entry.version}\n${entry.note ?? ''}`)
            .join('\n\n');
    return {
      version: info.version,
      notes,
      url: `${this.releasesURL}/tag/v${encodeURIComponent(info.version)}`,
    };
  }

  private message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private fail(error: unknown) {
    this.set({
      status: this.state.status === 'installing' ? 'downloaded' : 'error',
      error: this.message(error),
      progress: this.state.status === 'installing' ? 100 : null,
    });
  }

  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.getState());
  }

  dispose() {
    this.removers.forEach((remove) => remove());
    this.listeners.clear();
  }
}

import type { UpdateState, UpdatesAPI } from '@leaf/contracts/transport';
import { Store } from '@leaf/shared/events';

export class UpdatesClient {
  readonly state: Store<UpdateState>;
  private api?: UpdatesAPI;

  constructor(api: UpdatesAPI | undefined, version: string) {
    this.api = api;
    this.state = new Store<UpdateState>({
      status: 'disabled',
      currentVersion: version,
      installMode: 'disabled',
      reason: api ? '正在读取更新状态…' : '请在桌面应用中检查更新',
      release: null,
      progress: null,
      error: null,
    });
  }

  async connect() {
    if (!this.api) return () => {};
    let changed = false;
    const unsubscribe = this.api.subscribe((state) => {
      changed = true;
      this.state.set(state);
    });
    try {
      const state = await this.api.getState();
      // An event may be newer than the snapshot requested while connecting.
      if (!changed) this.state.set(state);
      return unsubscribe;
    } catch (error) {
      unsubscribe();
      throw error;
    }
  }

  private requireAPI() {
    if (!this.api) throw new Error('请在桌面应用中检查更新');
    return this.api;
  }

  check = () => this.requireAPI().check();
  download = () => this.requireAPI().download();
  install = () => this.requireAPI().install();
  openRelease = () => this.requireAPI().openRelease();
}

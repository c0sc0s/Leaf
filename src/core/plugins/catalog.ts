import type { CatalogEntry, CatalogSnapshot, DownloadProgress } from '@leaf/contracts/catalog';
import { compareVersions } from '@leaf/contracts/catalog';
import { compatibleVersion, HOST_API_VERSION } from '@leaf/contracts/plugins';
import { Store } from '@leaf/shared/events';
import type { PluginManager } from './manager.ts';

export interface CatalogPlatform {
  list(refresh?: boolean): Promise<CatalogSnapshot>;
  download(
    entry: CatalogEntry,
    signal: AbortSignal,
    progress: (value: DownloadProgress) => void,
  ): Promise<Uint8Array>;
}
export interface CatalogPlan {
  entries: CatalogEntry[];
  enable: string[];
  order: string[];
}
export interface CatalogState {
  loading: boolean;
  snapshot?: CatalogSnapshot;
  error?: string;
  progress?: DownloadProgress & { id: string; stage: 'download' | 'install' };
}
export class PluginCatalog {
  readonly state = new Store<CatalogState>({ loading: false });
  private controller?: AbortController;
  constructor(
    private platform: CatalogPlatform,
    private plugins: PluginManager,
  ) {}
  async load(refresh = false) {
    if (this.state.get().loading || this.controller) return;
    this.patch({ loading: true, error: undefined });
    try {
      this.patch({ snapshot: await this.platform.list(refresh) });
    } catch (error) {
      this.patch({ error: message(error) });
    } finally {
      this.patch({ loading: false });
    }
  }
  plan(id: string): CatalogPlan {
    const snapshot = this.state.get().snapshot;
    if (!snapshot || Date.parse(snapshot.catalog.expiresAt) <= Date.now())
      throw new Error('请刷新插件目录后再安装');
    const entries: CatalogEntry[] = [],
      enable = new Set<string>(),
      checked = new Map<string, string>(),
      order: string[] = [];
    const installed = this.plugins.state.get();
    const visit = (id: string, chain: Set<string>, range?: string) => {
      if (chain.has(id)) throw new Error('插件依赖存在循环');
      if (checked.has(id)) {
        if (range && !compatibleVersion(checked.get(id)!, range))
          throw new Error(`依赖版本要求冲突：${id}`);
        return;
      }
      const current = installed.find((plugin) => plugin.manifest.id === id);
      if (range && current && compatibleVersion(current.manifest.version, range)) {
        for (const [dependency, version] of Object.entries(current.manifest.dependencies))
          visit(dependency, new Set(chain).add(id), version);
        if (current.status !== 'active') {
          enable.add(id);
          order.push(id);
        }
        checked.set(id, current.manifest.version);
        return;
      }
      const entry = snapshot.catalog.plugins.find((entry) => entry.manifest.id === id);
      if (!entry || (range && !compatibleVersion(entry.manifest.version, range)))
        throw new Error(`目录中缺少可用的依赖：${id}${range ? ' ' + range : ''}`);
      if (!compatibleVersion(HOST_API_VERSION, entry.manifest.hostApi))
        throw new Error(`${entry.manifest.name} 需要更新 Leaf 后才能安装`);
      if (!entry.platforms.some((platform) => platform === snapshot.platform))
        throw new Error(`${entry.manifest.name} 不支持当前系统`);
      if (current && compareVersions(current.manifest.version, entry.manifest.version) > 0)
        throw new Error('已安装更新版本，不支持在线降级');
      for (const [dependency, version] of Object.entries(entry.manifest.dependencies))
        visit(dependency, new Set(chain).add(id), version);
      checked.set(id, entry.manifest.version);
      if (
        !current ||
        current.manifest.version !== entry.manifest.version ||
        current.packageHash !== entry.download.sha256
      )
        entries.push(entry);
      else if (current.status !== 'active') enable.add(id);
      if (entries.some((entry) => entry.manifest.id === id) || enable.has(id)) order.push(id);
    };
    visit(id, new Set());
    if (
      order.length > 20 ||
      entries.reduce((size, entry) => size + entry.download.size, 0) > 256 * 1024 * 1024
    )
      throw new Error('插件依赖或下载总量超过限制');
    const replacements = new Set(entries.map((entry) => entry.manifest.id));
    for (const plugin of installed.filter(
      (plugin) => plugin.enabled && !replacements.has(plugin.manifest.id),
    ))
      for (const [dependency, range] of Object.entries(plugin.manifest.dependencies)) {
        const version = checked.get(dependency);
        if (version && !compatibleVersion(version, range))
          throw new Error(`请先停用 ${plugin.manifest.name}：它需要 ${dependency} ${range}`);
      }
    return { entries, enable: [...enable], order };
  }
  cancel() {
    if (this.state.get().progress?.stage === 'download') this.controller?.abort();
  }
  async install(id: string, approved: CatalogPlan) {
    if (this.controller) throw new Error('已有插件正在安装');
    const plan = this.plan(id);
    if (JSON.stringify(plan) !== JSON.stringify(approved))
      throw new Error('插件目录或安装状态已改变，请重新确认');
    if (!plan.entries.length && !plan.enable.length) return;
    const controller = new AbortController();
    this.controller = controller;
    this.patch({ error: undefined });
    const downloads = new Map<string, Uint8Array>();
    const total = plan.entries.reduce((sum, entry) => sum + entry.download.size, 0);
    let received = 0,
      changed = false;
    try {
      for (const entry of plan.entries) {
        this.patch({ progress: { id, stage: 'download', received, total } });
        const bytes = await this.platform.download(entry, controller.signal, (progress) =>
          this.patch({
            progress: { id, stage: 'download', received: received + progress.received, total },
          }),
        );
        downloads.set(entry.manifest.id, bytes);
        received += bytes.byteLength;
      }
      controller.signal.throwIfAborted();
      if (JSON.stringify(this.plan(id)) !== JSON.stringify(approved))
        throw new Error('安装状态已改变，请重新确认');
      this.patch({ progress: { id, stage: 'install', received: total, total } });
      for (const pluginId of plan.order) {
        const entry = plan.entries.find((entry) => entry.manifest.id === pluginId);
        const previous = this.plugins.state.get().find((plugin) => plugin.manifest.id === pluginId);
        if (entry) {
          changed ||= this.plugins.state.get().some((plugin) => plugin.manifest.id === pluginId);
          await this.plugins.install(downloads.get(pluginId), { reload: false });
        }
        if (
          this.plugins.state.get().find((plugin) => plugin.manifest.id === pluginId)?.status !==
            'active' &&
          (!entry || !previous || previous.enabled || pluginId !== id)
        )
          await this.plugins.setEnabled(pluginId, true);
      }
      if (changed) await this.plugins.reload();
    } catch (error) {
      if (!controller.signal.aborted) {
        this.patch({ error: message(error) });
        throw error;
      }
    } finally {
      this.controller = undefined;
      this.patch({ progress: undefined });
    }
  }
  private patch(value: Partial<CatalogState>) {
    this.state.update((state) => ({ ...state, ...value }));
  }
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

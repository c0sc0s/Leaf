import type { PluginBinding, PluginState, PreparedPluginPackage } from '@leaf/contracts/plugins';
import { compatibleVersion } from '@leaf/contracts/plugins';
import type { Disposable } from '@leaf/shared/lifecycle';
import { Store } from '@leaf/shared/events';
import { SerialQueue } from '@leaf/shared/async';
import type { PluginRegistry } from './registry.ts';

export interface PluginPlatform {
  list(): Promise<PluginBinding[]>;
  prepare(data?: Uint8Array): Promise<PreparedPluginPackage | null>;
  install(data: Uint8Array): Promise<PluginBinding>;
  enable(id: string, enabled: boolean): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface PluginLoader {
  activate(binding: PluginBinding): Promise<Disposable>;
  reload(): Promise<void>;
}

export class PluginManager {
  readonly state = new Store<PluginState[]>([]);
  private instances = new Map<string, Disposable>();
  private queue = new SerialQueue();

  constructor(
    private platform: PluginPlatform,
    private loader: PluginLoader,
    readonly registry: PluginRegistry,
    private beforeDeactivate: (pluginId: string) => Promise<void>,
  ) {}

  async initialize() {
    const bindings = await this.platform.list();
    this.state.set(bindings.map((binding) => ({ ...binding, status: 'inactive' })));
    for (const binding of bindings.filter((entry) => entry.enabled)) {
      try {
        await this.activate(binding.manifest.id, new Set());
      } catch (error) {
        this.failed(binding.manifest.id, error);
      }
    }
  }

  install(data?: Uint8Array, { reload = true }: { reload?: boolean } = {}) {
    return this.queue.enqueue(async () => {
      const prepared = await this.platform.prepare(data);
      if (!prepared) return;
      const previous = this.state.get().find((entry) => entry.manifest.id === prepared.manifest.id);
      if (previous) await this.beforeDeactivate(previous.manifest.id);
      const binding = await this.platform.install(prepared.data);
      if (previous) {
        await this.instances.get(previous.manifest.id)?.dispose();
        this.instances.delete(previous.manifest.id);
      }
      this.state.update((entries) => [
        ...entries.filter((entry) => entry.manifest.id !== binding.manifest.id),
        { ...binding, status: 'inactive' },
      ]);
      if (binding.enabled) await this.activate(binding.manifest.id, new Set());
      if (previous && reload) await this.loader.reload();
    });
  }

  reload() {
    return this.loader.reload();
  }

  setEnabled(id: string, enabled: boolean) {
    return this.queue.enqueue(async () => {
      const entry = this.require(id);
      if (
        entry.enabled === enabled &&
        (enabled ? entry.status === 'active' : entry.status === 'inactive')
      )
        return;
      if (enabled) {
        await this.platform.enable(id, true);
        this.patch(id, { enabled: true });
        try {
          await this.activate(id, new Set());
        } catch (error) {
          if (!entry.enabled) {
            await this.platform.enable(id, false);
            this.patch(id, { enabled: false });
          }
          throw error;
        }
      } else {
        this.checkRemoval(id);
        await this.beforeDeactivate(id);
        await this.instances.get(id)?.dispose();
        this.instances.delete(id);
        try {
          await this.platform.enable(id, false);
        } catch (error) {
          await this.activate(id, new Set());
          throw error;
        }
        this.patch(id, { enabled: false, status: 'inactive', error: undefined });
      }
    });
  }

  remove(id: string) {
    return this.queue.enqueue(async () => {
      this.checkRemoval(id);
      await this.beforeDeactivate(id);
      await this.instances.get(id)?.dispose();
      this.instances.delete(id);
      try {
        await this.platform.remove(id);
      } catch (error) {
        if (this.require(id).enabled) await this.activate(id, new Set());
        throw error;
      }
      this.state.update((entries) => entries.filter((entry) => entry.manifest.id !== id));
      await this.loader.reload();
    });
  }

  async dispose() {
    for (const instance of [...this.instances.values()].reverse()) await instance.dispose();
    this.instances.clear();
  }

  private async activate(id: string, chain: Set<string>) {
    if (this.instances.has(id)) return;
    if (chain.has(id)) throw new Error(`插件依赖存在循环：${id}`);
    const entry = this.require(id);
    const next = new Set(chain).add(id);
    this.patch(id, { status: 'activating', error: undefined });
    try {
      for (const [dependency, range] of Object.entries(entry.manifest.dependencies)) {
        const installed = this.require(dependency);
        if (!installed.enabled || !compatibleVersion(installed.manifest.version, range))
          throw new Error(`插件 ${id} 需要启用 ${dependency} ${range}`);
        await this.activate(dependency, next);
      }
      const instance = await this.loader.activate(entry);
      this.instances.set(id, instance);
      this.patch(id, { status: 'active', error: undefined });
    } catch (error) {
      this.failed(id, error);
      throw error;
    }
  }

  private checkRemoval(id: string) {
    this.require(id);
    const dependents = this.state
      .get()
      .filter((entry) => entry.enabled && entry.manifest.dependencies[id]);
    if (dependents.length)
      throw new Error(
        `请先停用依赖它的插件：${dependents.map((entry) => entry.manifest.name).join('、')}`,
      );
    if (
      this.registry.hasReader(id) &&
      !this.state
        .get()
        .some(
          (entry) =>
            entry.manifest.id !== id &&
            entry.status === 'active' &&
            this.registry.hasReader(entry.manifest.id),
        )
    )
      throw new Error('至少需要保留一个启用的阅读插件');
  }
  private require(id: string) {
    const entry = this.state.get().find((entry) => entry.manifest.id === id);
    if (!entry) throw new Error(`插件尚未安装：${id}`);
    return entry;
  }
  private patch(id: string, changes: Partial<PluginState>) {
    this.state.update((entries) =>
      entries.map((entry) => (entry.manifest.id === id ? { ...entry, ...changes } : entry)),
    );
  }
  private failed(id: string, error: unknown) {
    this.patch(id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

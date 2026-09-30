import {
  mkdir,
  readFile,
  readdir,
  rm,
  rename,
  writeFile,
  realpath,
  stat,
  lstat,
} from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { PluginBinding } from '@leaf/contracts/plugins';
import { compatibleVersion } from '@leaf/contracts/plugins';
import { identifier, resourcePath } from '@leaf/contracts/validation';
import type { InstalledPlugin, StorageTransport } from '@leaf/contracts/transport';
import { SerialQueue } from '@leaf/shared/async';
import { readPackage } from './package.ts';

export class PluginInstaller {
  private queue = new SerialQueue();
  readonly root: string;
  private storage: StorageTransport;
  private resourceURL: (entry: InstalledPlugin, path: string) => string;
  private beforeChange: (id: string) => Promise<void>;
  constructor(
    root: string,
    storage: StorageTransport,
    resourceURL: (entry: InstalledPlugin, path: string) => string,
    beforeChange: (id: string) => Promise<void> = async () => {},
  ) {
    this.root = root;
    this.storage = storage;
    this.resourceURL = resourceURL;
    this.beforeChange = beforeChange;
  }
  async initialize(bundled: string[], defaults: string[] = ['leaf.pdf']) {
    await mkdir(this.root, { recursive: true });
    for (const name of await readdir(this.root))
      if (name.startsWith('.stage-'))
        await rm(path.join(this.root, name), { recursive: true, force: true });
    const settings = await this.storage.request('settings.list', undefined);
    if (!settings['plugins.seeded']) {
      for (const file of bundled) {
        const bytes = new Uint8Array(await readFile(file));
        const descriptor = readPackage(bytes).manifest;
        if (defaults.includes(descriptor.id)) await this.install(bytes);
      }
      await this.storage.request('settings.set', { key: 'plugins.seeded', value: true });
    }
    await this.collect();
  }
  async list(): Promise<PluginBinding[]> {
    return (await this.storage.request('plugins.list', undefined)).map((entry) => ({
      ...entry,
      moduleURL: this.resourceURL(entry, entry.manifest.entries.renderer),
    }));
  }
  inspect(data: Uint8Array) {
    return readPackage(data).manifest;
  }
  install(data: Uint8Array) {
    return this.queue.enqueue(async () => {
      const verified = readPackage(data);
      const installed = await this.storage.request('plugins.list', undefined);
      const previous = installed.find((entry) => entry.manifest.id === verified.manifest.id);
      const entry: InstalledPlugin = {
        manifest: verified.manifest,
        enabled: previous?.enabled ?? true,
        installedAt: Date.now(),
        packageHash: verified.hash,
      };
      this.dependencies([
        ...installed.filter((item) => item.manifest.id !== entry.manifest.id),
        entry,
      ]);
      const directory = this.directory(entry),
        temporary = path.join(this.root, '.stage-' + randomUUID());
      const displaced = path.join(this.root, '.stage-' + randomUUID());
      let replaced = false,
        moved = false;
      await mkdir(temporary, { recursive: true });
      try {
        for (const [name, bytes] of verified.files) {
          const target = path.join(temporary, name);
          await mkdir(path.dirname(target), { recursive: true });
          await writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
        }
        await mkdir(path.dirname(directory), { recursive: true });
        if (previous) await this.beforeChange(entry.manifest.id);
        if (await this.matches(directory, verified.files)) await rm(temporary, { recursive: true });
        else {
          try {
            await rename(directory, displaced);
            moved = true;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
          await rename(temporary, directory);
          replaced = true;
        }
        await this.storage.request('plugins.bind', entry);
      } catch (error) {
        await rm(temporary, { recursive: true, force: true });
        if (replaced) await rm(directory, { recursive: true, force: true });
        if (moved) await rename(displaced, directory);
        throw error;
      }
      if (moved) await rm(displaced, { recursive: true, force: true });
      return { ...entry, moduleURL: this.resourceURL(entry, entry.manifest.entries.renderer) };
    });
  }
  enable(id: string, enabled: boolean) {
    return this.queue.enqueue(async () => {
      const installed = await this.storage.request('plugins.list', undefined);
      const entry = installed.find((entry) => entry.manifest.id === identifier(id));
      if (!entry) throw new Error('插件尚未安装');
      this.dependencies(
        installed.map((entry) => (entry.manifest.id === id ? { ...entry, enabled } : entry)),
      );
      if (!enabled) await this.beforeChange(id);
      await this.storage.request('plugins.enable', { id, enabled });
    });
  }
  remove(id: string) {
    return this.queue.enqueue(async () => {
      identifier(id);
      await this.beforeChange(id);
      await this.storage.request('plugins.remove', id);
    });
  }
  async resource(id: string, hash: string, name: string) {
    const entry = (await this.storage.request('plugins.list', undefined)).find(
      (entry) => entry.manifest.id === id && entry.packageHash === hash && entry.enabled,
    );
    if (!entry) throw new Error('插件资源不可用');
    const directory = await realpath(this.directory(entry)),
      file = await realpath(path.join(directory, resourcePath(name)));
    if (!file.startsWith(directory + path.sep) || !(await stat(file)).isFile())
      throw new Error('无效的插件资源');
    return file;
  }
  async backend(id: string) {
    const entry = (await this.storage.request('plugins.list', undefined)).find(
      (entry) => entry.manifest.id === id && entry.enabled,
    );
    if (!entry?.manifest.entries.backend || !entry.manifest.permissions.includes('backend'))
      throw new Error('插件后台服务不可用');
    const file = await this.resource(id, entry.packageHash, entry.manifest.entries.backend);
    return { entry, moduleURL: pathToFileURL(file).href };
  }
  private directory(entry: InstalledPlugin) {
    return path.join(this.root, entry.manifest.id, entry.packageHash);
  }
  private async matches(directory: string, files: Map<string, Uint8Array>) {
    try {
      if (!(await lstat(directory)).isDirectory()) return false;
      let count = 0;
      const visit = async (parent: string): Promise<boolean> => {
        for (const entry of await readdir(parent, { withFileTypes: true })) {
          const file = path.join(parent, entry.name);
          if (entry.isDirectory()) {
            if (!(await visit(file))) return false;
          } else {
            const expected = files.get(path.relative(directory, file).split(path.sep).join('/'));
            if (!entry.isFile() || !expected || !Buffer.from(expected).equals(await readFile(file)))
              return false;
            count++;
          }
        }
        return true;
      };
      return (await visit(directory)) && count === files.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
  private dependencies(entries: InstalledPlugin[]) {
    const checked = new Set<string>();
    const check = (entry: InstalledPlugin, chain: Set<string>) => {
      if (checked.has(entry.manifest.id)) return;
      if (chain.has(entry.manifest.id)) throw new Error('插件依赖存在循环');
      for (const [id, range] of Object.entries(entry.manifest.dependencies)) {
        const dependency = entries.find((item) => item.manifest.id === id && item.enabled);
        if (!dependency || !compatibleVersion(dependency.manifest.version, range))
          throw new Error(`${entry.manifest.name} 需要启用 ${id} ${range}`);
        check(dependency, new Set(chain).add(entry.manifest.id));
      }
      checked.add(entry.manifest.id);
    };
    for (const entry of entries.filter((entry) => entry.enabled)) check(entry, new Set());
  }
  private async collect() {
    const entries = await this.storage.request('plugins.list', undefined);
    for (const id of await readdir(this.root)) {
      if (id.startsWith('.')) continue;
      const base = path.join(this.root, id);
      if (!(await stat(base)).isDirectory()) continue;
      for (const hash of await readdir(base))
        if (!entries.some((entry) => entry.manifest.id === id && entry.packageHash === hash))
          await rm(path.join(base, hash), { recursive: true, force: true });
    }
  }
}

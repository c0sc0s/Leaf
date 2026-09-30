import type {
  DocumentHandle,
  DocumentProvider,
  DocumentInteractions,
  ImportSource,
} from '@leaf/contracts/documents';
import type { Disposable } from '@leaf/shared/lifecycle';
import type { LibraryRepository, DocumentLease } from '../library/repository.ts';
import type { PluginRegistry } from '../plugins/registry.ts';
import { withSignal } from '@leaf/shared/async';

export interface DocumentReference extends Disposable {
  document: DocumentHandle;
  providerId: string;
  pluginId: string;
}
interface Entry {
  users: number;
  controller: AbortController;
  value: Promise<Omit<DocumentReference, 'dispose'>>;
  lease?: DocumentLease;
  document?: DocumentHandle;
  pluginId?: string;
  closing?: Promise<void>;
}

export class DocumentsService {
  private entries = new Map<string, Entry>();
  constructor(
    private repository: Pick<LibraryRepository, 'open'>,
    private registry: PluginRegistry,
    private interactions: DocumentInteractions,
    private openExternal: (url: string) => Promise<void>,
  ) {}

  formats() {
    return this.registry.providers().flatMap((entry) => entry.provider.formats);
  }

  async importer(source: ImportSource, signal: AbortSignal): Promise<DocumentProvider | null> {
    const providers = this.registry.providers().map((entry) => entry.provider);
    const checked = await Promise.allSettled(
      providers.map(async (provider) => ({
        provider,
        score: await withSignal(provider.probe(source, signal), signal),
      })),
    );
    signal.throwIfAborted();
    const matches = checked
      .flatMap((entry) =>
        entry.status === 'fulfilled' && Number.isFinite(entry.value.score) && entry.value.score > 0
          ? [entry.value]
          : [],
      )
      .sort((a, b) => b.score - a.score);
    if (!matches.length) throw new Error('请安装或启用支持此文件的阅读插件');
    if (matches.length === 1 || matches[0].score > matches[1].score) return matches[0].provider;
    const id = await this.interactions.choose(
      '选择阅读插件',
      matches.map((entry) => ({
        id: entry.provider.id,
        label: entry.provider.formats.map((format) => format.label).join(' / '),
      })),
      signal,
    );
    return matches.find((entry) => entry.provider.id === id)?.provider ?? null;
  }

  async acquire(id: string, signal?: AbortSignal): Promise<DocumentReference> {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { users: 0, controller: new AbortController(), value: undefined! };
      const current = entry;
      current.value = this.open(id, current).catch((error) => {
        if (this.entries.get(id) === current) this.entries.delete(id);
        throw error;
      });
      this.entries.set(id, current);
    }
    entry.users++;
    const current = entry;
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      if (--current.users === 0) {
        if (this.entries.get(id) === current) this.entries.delete(id);
        await this.close(current);
      }
    };
    try {
      signal?.throwIfAborted();
      const opened = await withSignal(current.value, signal);
      signal?.throwIfAborted();
      return { ...opened, dispose: release };
    } catch (error) {
      void release().catch(() => {});
      throw error;
    }
  }

  async dispose() {
    for (const [id, entry] of this.entries) {
      this.entries.delete(id);
      await this.close(entry);
    }
  }

  private close(entry: Entry) {
    if (!entry.closing) {
      entry.controller.abort();
      entry.closing = (async () => {
        await entry.value.catch(() => {});
        try {
          await entry.document?.dispose();
        } finally {
          await entry.lease?.dispose();
        }
      })();
    }
    return entry.closing;
  }

  private async open(id: string, entry: Entry): Promise<Omit<DocumentReference, 'dispose'>> {
    const lease = await this.repository.open(id);
    if (!lease) throw new Error('文档已从书库移除');
    entry.lease = lease;
    entry.controller.signal.throwIfAborted();
    const candidates = this.registry
      .providers()
      .filter((item) =>
        item.provider.formats.some((format) => format.id === lease.record.metadata.formatId),
      );
    if (!candidates.length) throw new Error('缺少阅读插件，请安装支持此文档的插件');
    let selected = candidates[0];
    if (candidates.length > 1) {
      const choice = await this.interactions.choose(
        '选择阅读插件',
        candidates.map((entry) => ({ id: entry.provider.id, label: entry.provider.id })),
        entry.controller.signal,
      );
      const matched = candidates.find((entry) => entry.provider.id === choice);
      if (!matched) throw new Error('已取消打开文档');
      selected = matched;
    }
    entry.pluginId = selected.pluginId;
    entry.document = await selected.provider.open(
      lease.record,
      {
        readResource: lease.readResource,
        interactions: this.interactions,
        openExternal: this.openExternal,
      },
      entry.controller.signal,
    );
    entry.controller.signal.throwIfAborted();
    return {
      document: entry.document,
      providerId: selected.provider.id,
      pluginId: selected.pluginId,
    };
  }
}

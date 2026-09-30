import type { PluginHostAPI, ScopedStorage, TaskEvent } from '@leaf/contracts/host';
import type { PluginBinding } from '@leaf/contracts/plugins';
import type { JsonValue } from '@leaf/shared/types';
import { Store } from '@leaf/shared/events';
import { StorageClient } from '../platform/transport/storage';
import { PersistenceCoordinator } from '../platform/transport/persistence';
import { LibraryClient } from '../platform/repositories/library';
import { AnnotationClient } from '../platform/repositories/annotations';
import { ReaderClient } from '../platform/repositories/reader';
import { PluginsClient } from '../platform/plugins/client';
import { BackendTransport } from '../platform/plugins/backend';
import { RendererLoader } from '../platform/plugins/loader';
import { PluginRegistry } from '../core/plugins/registry';
import { PluginManager } from '../core/plugins/manager';
import { DocumentsService } from '../core/documents/service';
import { InteractionsService } from '../core/documents/interactions';
import { LibraryService } from '../core/library/service';
import { ReadingController } from '../core/reader/controller';
import { SettingsService } from '../core/settings/service';
import { configureUIPreferences } from '@leaf/ui/preferences';

export async function compose() {
  const persistence = new PersistenceCoordinator(),
    storage = new StorageClient();
  const notices = new Store<string | null>(null),
    notify = (message: string) => notices.set(message);
  const settings = new SettingsService(storage);
  await settings.initialize();
  configureUIPreferences({
    get: (key) => {
      const value = settings.values.get()['ui.' + key];
      return typeof value === 'string' ? value : null;
    },
    set: (key, value) => {
      void persistence
        .track(settings.preference('ui.' + key, value), `setting:ui.${key}`)
        .catch((error) => notify(String(error)));
    },
  });
  const registry = new PluginRegistry(),
    interactions = new InteractionsService();
  const documents = new DocumentsService(
    new LibraryClient(storage, persistence),
    registry,
    interactions,
    async (url) => {
      const value = new URL(url);
      if (!['http:', 'https:'].includes(value.protocol)) throw new Error('不支持这个链接');
      if (window.desktop) await window.desktop.openExternal(value.href);
      else window.open(value.href, '_blank', 'noopener,noreferrer');
    },
  );
  let reader: ReadingController;
  const library = new LibraryService(
    new LibraryClient(storage, persistence),
    documents,
    interactions,
    async (id) => {
      await persistence.flush();
      await reader.closeDocument(id);
    },
  );
  reader = new ReadingController(
    documents,
    new AnnotationClient(storage, persistence),
    new ReaderClient(storage, persistence),
    (id, progress) => library.progress(id, progress),
    notify,
  );
  persistence.register(() => reader.flush());
  const scopedStorage = (pluginId: string, signal: AbortSignal): ScopedStorage => {
    const scope = (documentId?: string) => (documentId ? { documentId } : {});
    return {
      get: async <T extends JsonValue>(key: string, documentId?: string) => {
        signal.throwIfAborted();
        return (await storage.request('plugins.data.get', {
          pluginId,
          key,
          ...scope(documentId),
        })) as T | null;
      },
      set: async (key, value, documentId) => {
        signal.throwIfAborted();
        await persistence.track(
          storage.request('plugins.data.set', { pluginId, key, value, ...scope(documentId) }),
          `plugin:${pluginId}:${documentId ?? ''}:${key}`,
        );
      },
      delete: async (key, documentId) => {
        signal.throwIfAborted();
        await persistence.track(
          storage.request('plugins.data.delete', { pluginId, key, ...scope(documentId) }),
          `plugin:${pluginId}:${documentId ?? ''}:${key}`,
        );
      },
      list: async (prefix, documentId) => {
        signal.throwIfAborted();
        return storage.request('plugins.data.list', { pluginId, prefix, ...scope(documentId) });
      },
    };
  };
  const host = (binding: PluginBinding, signal: AbortSignal): PluginHostAPI => {
    const require = (permission: PluginBinding['manifest']['permissions'][number]) => {
      signal.throwIfAborted();
      if (!binding.manifest.permissions.includes(permission))
        throw new Error(`插件未声明 ${permission} 权限`);
    };
    const pluginId = binding.manifest.id,
      scoped = scopedStorage(pluginId, signal),
      backend = new BackendTransport(pluginId, signal);
    return {
      reading: {
        active: () => {
          require('documents');
          return reader.state.get().active;
        },
      },
      library: {
        list: async () => {
          require('documents');
          return library.state.get().documents;
        },
      },
      storage: {
        get: (key, id) => {
          require('storage');
          return scoped.get(key, id);
        },
        set: (key, value, id) => {
          require('storage');
          return scoped.set(key, value, id);
        },
        delete: (key, id) => {
          require('storage');
          return scoped.delete(key, id);
        },
        list: (prefix, id) => {
          require('storage');
          return scoped.list(prefix, id);
        },
      },
      backend: {
        request: (method, input, requestSignal) => {
          require('backend');
          return backend.request(method, input, requestSignal);
        },
        stream: (method, input, options) => {
          require('backend');
          return backend.stream(method, input, options);
        },
      },
      tasks: {
        report: async (event: TaskEvent) => {
          if (!binding.manifest.permissions.includes('storage'))
            throw new Error('插件未声明存储权限');
          await persistence.track(
            storage.request('tasks.report', { ...event, pluginId }),
            `trace:${pluginId}:${event.runId}`,
          );
        },
        list: async (runId) => {
          require('storage');
          return storage.request('tasks.list', { pluginId, ...(runId ? { runId } : {}) });
        },
      },
      notify,
    };
  };
  const plugins = new PluginManager(
    new PluginsClient(),
    new RendererLoader(registry, host, async () => {
      await persistence.flush();
      await storage.request('flush', undefined);
    }),
    registry,
    async (id) => {
      await persistence.flush();
      await reader.closePlugin(id);
    },
  );
  await plugins.initialize();
  await library.initialize();
  const flush = async () => {
    await persistence.flush();
    await storage.request('flush', undefined);
  };
  return {
    storage,
    persistence,
    registry,
    plugins,
    documents,
    interactions,
    library,
    reader,
    settings,
    notices,
    notify,
    flush,
  };
}
export type AppServices = Awaited<ReturnType<typeof compose>>;

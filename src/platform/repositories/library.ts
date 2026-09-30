import type { DocumentMetadata, DocumentRecord, ImportFile } from '@leaf/contracts';
import type { StorageTransport } from '@leaf/contracts/transport';
import { resourcePath } from '@leaf/contracts/validation';
import type {
  LibraryRepository,
  StagedResources,
  DocumentLease,
} from '../../core/library/repository.ts';
import type { PersistenceCoordinator } from '../transport/persistence.ts';

const chunkSize = 1024 * 1024;
function encode(bytes: Uint8Array) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192)
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}

export class LibraryClient implements LibraryRepository {
  constructor(
    private transport: StorageTransport,
    private persistence: PersistenceCoordinator,
  ) {}
  list() {
    return this.transport.request('library.list', undefined);
  }
  find(formatId: string, revision: string) {
    return this.transport.request('library.find', { formatId, revision });
  }
  annotationCounts() {
    return this.transport.request('annotations.counts', undefined);
  }

  async stage(files: ImportFile[], signal: AbortSignal): Promise<StagedResources> {
    const staged: StagedResources = {
      resources: [],
      uploads: [],
      dispose: async () => {
        await Promise.all(
          staged.uploads.map((entry) => this.transport.request('content.release', entry.token)),
        );
      },
    };
    const paths = new Set<string>();
    try {
      for (const file of files) {
        signal.throwIfAborted();
        const name = resourcePath(file.name);
        if (paths.has(name)) throw new Error('资源路径重复');
        paths.add(name);
        const mime = file.mime || 'application/octet-stream';
        const token = await this.transport.request('content.begin', {
          size: file.data.byteLength,
          mime,
        });
        try {
          for (let offset = 0; offset < file.data.byteLength; offset += chunkSize) {
            signal.throwIfAborted();
            await this.transport.request('content.append', {
              token,
              offset,
              data: encode(file.data.subarray(offset, offset + chunkSize)),
            });
          }
          const reference = await this.transport.request('content.finish', token);
          staged.resources.push({
            path: name,
            hash: reference.hash,
            size: reference.size,
            mime: reference.mime,
          });
          staged.uploads.push({ hash: reference.hash, token });
        } catch (error) {
          await this.transport.request('content.abort', token);
          throw error;
        }
      }
      return staged;
    } catch (error) {
      await staged.dispose();
      throw error;
    }
  }

  put(record: DocumentRecord, resources: StagedResources) {
    return this.persistence.track(
      this.transport.request('library.put', { ...record, uploads: resources.uploads }),
      `document:${record.metadata.id}`,
    );
  }
  update(metadata: DocumentMetadata) {
    return this.persistence.track(
      this.transport.request('library.update', metadata),
      `document:${metadata.id}`,
    );
  }
  async remove(id: string) {
    await this.persistence.track(this.transport.request('library.delete', id), `document:${id}`);
    this.persistence.forget(`document:${id}`);
  }

  async open(id: string): Promise<DocumentLease | null> {
    const loaded = await this.transport.request('library.get', id);
    if (!loaded) return null;
    let released = false;
    const pending = new Set<Promise<unknown>>();
    return {
      record: { metadata: loaded.metadata, source: loaded.source },
      readResource: (name, signal) => {
        const reference = loaded.source.resources.find(
          (entry) => entry.path === resourcePath(name),
        );
        if (!reference || released) return Promise.reject(new Error('文档资源不可用'));
        const operation = (async () => {
          const bytes = new Uint8Array(reference.size);
          for (let offset = 0; offset < reference.size; offset += chunkSize) {
            signal?.throwIfAborted();
            const data = await this.transport.request('content.read', {
              reference,
              token: loaded.lease,
              offset,
            });
            const chunk = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
            if (chunk.length !== Math.min(chunkSize, reference.size - offset))
              throw new Error('文档资源读取不完整');
            bytes.set(chunk, offset);
          }
          signal?.throwIfAborted();
          return bytes;
        })();
        pending.add(operation);
        void operation.then(
          () => pending.delete(operation),
          () => pending.delete(operation),
        );
        return operation;
      },
      dispose: async () => {
        if (released) return;
        released = true;
        await Promise.allSettled(pending);
        await this.transport.request('content.release', loaded.lease);
      },
    };
  }
}

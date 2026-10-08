import type { CatalogPlatform } from '../../core/plugins/catalog.ts';
import type {
  CatalogEntry,
  CatalogSnapshot,
  CatalogDownloadEvent,
  DownloadProgress,
} from '@leaf/contracts/catalog';

export class CatalogClient implements CatalogPlatform {
  async list(refresh = false): Promise<CatalogSnapshot> {
    if (window.desktop) return window.desktop.catalog.list(refresh);
    const response = await fetch('/__leaf_catalog', {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ operation: 'list', refresh }),
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || '插件目录不可用');
    return body.result;
  }
  async download(
    entry: CatalogEntry,
    signal: AbortSignal,
    progress: (value: DownloadProgress) => void,
  ): Promise<Uint8Array> {
    signal.throwIfAborted();
    const desktop = window.desktop;
    if (desktop) {
      const requestId = crypto.randomUUID();
      const stop = desktop.catalog.onProgress((id, value) => {
        if (id === requestId) progress(value);
      });
      const abort = () => desktop.catalog.cancel(requestId);
      signal.addEventListener('abort', abort, { once: true });
      try {
        return await desktop.catalog.download(requestId, entry.manifest.id, entry.download.sha256);
      } finally {
        signal.removeEventListener('abort', abort);
        stop();
      }
    }
    const response = await fetch('/__leaf_catalog', {
      method: 'POST',
      headers: this.headers,
      signal,
      body: JSON.stringify({
        operation: 'download',
        id: entry.manifest.id,
        sha256: entry.download.sha256,
      }),
    });
    if (!response.ok || !response.body) throw new Error('插件下载服务不可用');
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = '',
      received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > 90 * 1024 * 1024) throw new Error('下载响应超过大小限制');
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const event = JSON.parse(buffer.slice(0, newline)) as CatalogDownloadEvent;
          buffer = buffer.slice(newline + 1);
          if (event.type === 'progress') progress(event);
          else if (event.type === 'error') throw new Error(event.message);
          else if (event.type === 'done')
            return Uint8Array.from(atob(event.data), (char) => char.charCodeAt(0));
        }
      }
      throw new Error('插件下载中断，请重试');
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  private readonly headers = { 'Content-Type': 'application/json', 'X-Leaf-Catalog': '1' };
}

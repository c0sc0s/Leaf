import type { PluginBinding, PluginManifest, PreparedPluginPackage } from '@leaf/contracts/plugins';
import type { PluginPlatform } from '../../core/plugins/manager.ts';

export class PluginsClient implements PluginPlatform {
  list(): Promise<PluginBinding[]> {
    return window.desktop ? window.desktop.plugins.list() : this.request('list');
  }
  async prepare(data?: Uint8Array): Promise<PreparedPluginPackage | null> {
    if (window.desktop) return window.desktop.plugins.prepare(data);
    if (!data) {
      const file = await choosePackage();
      if (!file) return null;
      data = new Uint8Array(await file.arrayBuffer());
    }
    return {
      data,
      manifest: await this.request<PluginManifest>('prepare', { data: encode(data) }),
    };
  }
  install(data: Uint8Array): Promise<PluginBinding> {
    return window.desktop
      ? window.desktop.plugins.install(data)
      : this.request('install', { data: encode(data) });
  }
  enable(id: string, enabled: boolean): Promise<void> {
    return window.desktop
      ? window.desktop.plugins.enable(id, enabled)
      : this.request('enable', { id, enabled });
  }
  remove(id: string): Promise<void> {
    return window.desktop ? window.desktop.plugins.remove(id) : this.request('remove', { id });
  }
  private async request<T>(operation: string, input?: unknown): Promise<T> {
    const response = await fetch('/__leaf_plugins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Leaf-Plugins': '1' },
      body: JSON.stringify({ operation, input }),
    });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || '插件服务不可用');
    return body.result;
  }
}
function encode(data: Uint8Array) {
  let encoded = '';
  for (let offset = 0; offset < data.byteLength; offset += 8192)
    encoded += String.fromCharCode(...data.subarray(offset, offset + 8192));
  return btoa(encoded);
}
function choosePackage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.leaf-plugin';
    input.onchange = () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    input.oncancel = () => {
      resolve(null);
      input.remove();
    };
    input.style.display = 'none';
    document.body.append(input);
    input.click();
  });
}

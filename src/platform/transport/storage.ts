import type {
  StorageTransport,
  StorageOperation,
  StorageInput,
  StorageOutput,
} from '@leaf/contracts/transport';

export class StorageClient implements StorageTransport {
  async request<K extends StorageOperation>(
    operation: K,
    input: StorageInput<K>,
  ): Promise<StorageOutput<K>> {
    if (window.desktop) return window.desktop.storage.request(operation, input);
    const response = await fetch('/__leaf_storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Leaf-Storage': '1' },
      body: JSON.stringify({ operation, input }),
    });
    const body = (await response.json()) as { result: StorageOutput<K>; error?: string };
    if (!response.ok || body.error) throw new Error(body.error || '本地存储不可用');
    return body.result;
  }
}

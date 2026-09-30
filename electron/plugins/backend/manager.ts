import { randomUUID } from 'node:crypto';
import type { BackendRequest } from '@leaf/contracts/transport';
import type { StorageTransport, InstalledPlugin } from '@leaf/contracts/transport';
import type { JsonValue } from '@leaf/shared/types';
import { withSignal } from '@leaf/shared/async';
import { json, identifier } from '@leaf/contracts/validation';
import { jsonObject } from '@leaf/shared/types';
import type { CredentialVault } from '../../platform/credentials.ts';
import type { PluginInstaller } from '../installer.ts';
import type { BackendProcess, ChildMessage } from './protocol.ts';

interface Run {
  resolve(value: JsonValue | undefined): void;
  reject(error: Error): void;
  emit?(value: JsonValue): void;
  cleanup(): void;
}
interface Instance {
  process: BackendProcess;
  entry: InstalledPlugin;
  ready: Promise<void>;
  runs: Map<string, Run>;
  closed: boolean;
  finishReady(): void;
  failReady(error: Error): void;
  onClosed(): void;
  closedPromise: Promise<void>;
}

export class BackendManager {
  private instances = new Map<string, Promise<Instance>>();
  private installer: PluginInstaller;
  private storage: StorageTransport;
  private credentials: CredentialVault;
  private launch: () => BackendProcess;
  private environment: Record<string, string | undefined>;
  constructor(
    installer: PluginInstaller,
    storage: StorageTransport,
    credentials: CredentialVault,
    launch: () => BackendProcess,
    environment: Record<string, string | undefined>,
  ) {
    this.installer = installer;
    this.storage = storage;
    this.credentials = credentials;
    this.launch = launch;
    this.environment = environment;
  }
  async request(request: BackendRequest, signal: AbortSignal): Promise<JsonValue> {
    return (await this.run(request, signal)) ?? null;
  }
  async stream(
    request: BackendRequest,
    signal: AbortSignal,
    emit: (value: JsonValue) => void,
  ): Promise<void> {
    await this.run(request, signal, emit);
  }
  async stop(id: string) {
    const pending = this.instances.get(id);
    if (!pending) return;
    this.instances.delete(id);
    const instance = await pending.catch(() => null);
    if (!instance) return;
    instance.closed = true;
    this.fail(instance, new Error('插件已停用'));
    instance.process.send({ type: 'close' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      instance.closedPromise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2000);
      }),
    ]);
    clearTimeout(timer);
    await instance.process.terminate();
  }
  async dispose() {
    await Promise.all([...this.instances.keys()].map((id) => this.stop(id)));
  }
  private async run(
    request: BackendRequest,
    signal: AbortSignal,
    emit?: (value: JsonValue) => void,
  ) {
    identifier(request.pluginId);
    identifier(request.method);
    if (request.input !== undefined) json(request.input);
    signal.throwIfAborted();
    const instance = await withSignal(this.instance(request.pluginId), signal);
    await withSignal(instance.ready, signal);
    signal.throwIfAborted();
    if (instance.closed) throw new Error('插件后台服务已关闭');
    const id = request.requestId ?? randomUUID();
    if (instance.runs.has(id)) throw new Error('任务 ID 重复');
    return new Promise<JsonValue | undefined>((resolve, reject) => {
      const abort = () => {
        instance.runs.delete(id);
        cleanup();
        instance.process.send({ type: 'cancel', id });
        reject(signal.reason instanceof Error ? signal.reason : new Error('任务已取消'));
      };
      const cleanup = () => signal.removeEventListener('abort', abort);
      instance.runs.set(id, { resolve, reject, emit, cleanup });
      signal.addEventListener('abort', abort, { once: true });
      instance.process.send({
        type: 'call',
        id,
        method: request.method,
        ...(request.input === undefined ? {} : { input: request.input }),
        stream: !!emit,
      });
    });
  }
  private instance(id: string): Promise<Instance> {
    let pending = this.instances.get(id);
    if (!pending) {
      pending = this.create(id);
      this.instances.set(id, pending);
      const current = pending;
      void pending.catch(() => {
        if (this.instances.get(id) === current) this.instances.delete(id);
      });
    }
    return pending;
  }
  private async create(id: string) {
    const { entry, moduleURL } = await this.installer.backend(id);
    const child = this.launch();
    let finishReady!: () => void, failReady!: (error: Error) => void, onClosed!: () => void;
    const ready = new Promise<void>((resolve, reject) => {
      finishReady = resolve;
      failReady = reject;
    });
    const closedPromise = new Promise<void>((resolve) => {
      onClosed = resolve;
    });
    const instance: Instance = {
      process: child,
      entry,
      ready,
      runs: new Map(),
      closed: false,
      finishReady,
      failReady,
      closedPromise,
      onClosed,
    };
    const fail = (error: Error) => {
      onClosed();
      if (instance.closed) return;
      instance.closed = true;
      this.fail(instance, error);
      failReady(error);
      const pending = this.instances.get(id);
      void pending?.then(
        (current) => {
          if (current === instance && this.instances.get(id) === pending) this.instances.delete(id);
        },
        () => {},
      );
      void child.terminate().catch(() => {});
    };
    child.listen((message) => {
      void this.receive(instance, message).catch(fail);
    }, fail);
    const prefix = `LEAF_${id.split('.').at(-1)!.toUpperCase()}_`;
    const environment = Object.fromEntries(
      Object.entries(this.environment).filter(([name]) => name.startsWith(prefix)),
    );
    child.send({ type: 'initialize', moduleURL, environment });
    const timer = setTimeout(() => fail(new Error('插件后台服务启动超时')), 15000);
    try {
      await ready;
      return instance;
    } catch (error) {
      await child.terminate();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  private async receive(instance: Instance, message: ChildMessage) {
    if (message.type === 'ready') instance.finishReady();
    else if (message.type === 'failed') instance.failReady(new Error(message.message));
    else if (message.type === 'closed') instance.onClosed();
    else if (message.type === 'event') instance.runs.get(message.id)?.emit?.(json(message.value));
    else if (message.type === 'result') {
      const run = instance.runs.get(message.id);
      if (!run) return;
      instance.runs.delete(message.id);
      run.cleanup();
      if (message.error) run.reject(new Error(message.error));
      else run.resolve(message.value);
    } else if (message.type === 'hostCall') {
      try {
        const value = await this.hostCall(instance, message.method, message.input);
        instance.process.send({
          type: 'hostResult',
          id: message.id,
          ...(value === undefined ? {} : { value }),
        });
      } catch (error) {
        instance.process.send({
          type: 'hostResult',
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  private async hostCall(
    instance: Instance,
    method: string,
    value: JsonValue,
  ): Promise<JsonValue | undefined> {
    const input = jsonObject(value),
      pluginId = instance.entry.manifest.id;
    if (method.startsWith('storage.')) {
      if (!instance.entry.manifest.permissions.includes('storage'))
        throw new Error('插件未声明存储权限');
      const documentId =
        input.documentId === undefined ? {} : { documentId: identifier(input.documentId) };
      if (method === 'storage.get')
        return this.storage.request('plugins.data.get', {
          pluginId,
          key: identifier(input.key),
          ...documentId,
        });
      if (method === 'storage.set') {
        await this.storage.request('plugins.data.set', {
          pluginId,
          key: identifier(input.key),
          value: json(input.value),
          ...documentId,
        });
        return;
      }
      if (method === 'storage.delete') {
        await this.storage.request('plugins.data.delete', {
          pluginId,
          key: identifier(input.key),
          ...documentId,
        });
        return;
      }
      if (method === 'storage.list')
        return this.storage.request('plugins.data.list', {
          pluginId,
          prefix: typeof input.prefix === 'string' ? input.prefix : '',
          ...documentId,
        });
    } else if (method.startsWith('credentials.')) {
      if (!instance.entry.manifest.permissions.includes('credentials'))
        throw new Error('插件未声明凭据权限');
      if (method === 'credentials.get')
        return this.credentials.get(pluginId, identifier(input.key));
      if (method === 'credentials.set') {
        await this.credentials.set(
          pluginId,
          identifier(input.key),
          input.value === null ? null : identifier(input.value),
        );
        return;
      }
    }
    throw new Error('无效的宿主服务请求');
  }
  private fail(instance: Instance, error: Error) {
    for (const run of instance.runs.values()) {
      run.cleanup();
      run.reject(error);
    }
    instance.runs.clear();
  }
}

import type { PluginHostAPI } from '@leaf/contracts/host';
import type { PluginBinding } from '@leaf/contracts/plugins';
import { withSignal } from '@leaf/shared/async';
import { ResourceScope } from '@leaf/shared/lifecycle';
import { createPluginContext } from '@leaf/plugin-sdk';
import type { RendererPlugin } from '@leaf/plugin-sdk';
import type { PluginLoader } from '../../core/plugins/manager.ts';
import type { PluginRegistry } from '../../core/plugins/registry.ts';

export class RendererLoader implements PluginLoader {
  constructor(
    private registry: PluginRegistry,
    private host: (binding: PluginBinding, signal: AbortSignal) => PluginHostAPI,
    private flush: () => Promise<void>,
  ) {}
  async activate(binding: PluginBinding) {
    const scope = new ResourceScope(),
      deadline = AbortSignal.any([scope.signal, AbortSignal.timeout(15000)]);
    try {
      for (const style of binding.manifest.styles ?? []) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = new URL(
          style,
          binding.moduleURL.startsWith('/')
            ? location.origin + binding.moduleURL
            : binding.moduleURL,
        ).href;
        scope.own({ dispose: () => link.remove() });
        await withSignal(
          new Promise<void>((resolve, reject) => {
            link.onload = () => resolve();
            link.onerror = () => reject(new Error('插件样式无法加载'));
            document.head.append(link);
          }),
          deadline,
        );
      }
      const module = (await withSignal(import(/* @vite-ignore */ binding.moduleURL), deadline)) as {
        default?: RendererPlugin;
      };
      if (!module.default || typeof module.default.activate !== 'function')
        throw new Error('插件 Renderer 入口无效');
      const context = createPluginContext(
        binding.manifest,
        this.host(binding, scope.signal),
        this.registry,
        scope,
      );
      await withSignal(
        Promise.resolve(module.default.activate(context)).then((disposable) => {
          if (disposable) scope.own(disposable);
        }),
        deadline,
      );
      for (const [kind, ids] of Object.entries(binding.manifest.contributes))
        for (const id of ids)
          if (
            !this.registry.resolve(kind as import('@leaf/contracts/plugins').ContributionKind, id)
          )
            throw new Error(`插件未注册声明的能力：${id}`);
      return { dispose: () => scope.dispose() };
    } catch (error) {
      await scope.dispose();
      throw error;
    }
  }
  async reload() {
    await this.flush();
    location.reload();
  }
}

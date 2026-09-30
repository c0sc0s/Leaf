import type {
  DocumentProvider,
  PluginHostAPI,
  PluginManifest,
  ContributionKind,
} from '@leaf/contracts';
import type { Disposable } from '@leaf/shared/lifecycle';
import type { ResourceScope } from '@leaf/shared/lifecycle';
import type { ViewFactory, PanelFactory, SettingsFactory, ReaderAction } from '../view/index.ts';

export interface ContributionSink {
  register(
    pluginId: string,
    kind: ContributionKind,
    id: string,
    implementation: unknown,
  ): Disposable;
}
export interface PluginContext {
  manifest: PluginManifest;
  host: PluginHostAPI;
  scope: ResourceScope;
  registerDocumentProvider(provider: DocumentProvider): Disposable;
  registerView(factory: ViewFactory): Disposable;
  registerSelectionAction(action: ReaderAction): Disposable;
  registerToolbarAction(action: ReaderAction): Disposable;
  registerPanel(panel: PanelFactory): Disposable;
  registerSettings(settings: SettingsFactory): Disposable;
}
export interface RendererPlugin {
  activate(context: PluginContext): void | Disposable | Promise<void | Disposable>;
}

export function createPluginContext(
  manifest: PluginManifest,
  host: PluginHostAPI,
  sink: ContributionSink,
  scope: ResourceScope,
): PluginContext {
  const register = (kind: ContributionKind, value: { id: string }) => {
    if (!manifest.contributes[kind]?.includes(value.id))
      throw new Error(`Undeclared contribution: ${kind}/${value.id}`);
    return scope.own(sink.register(manifest.id, kind, value.id, value));
  };
  return {
    manifest,
    host,
    scope,
    registerDocumentProvider: (value) => register('documentProviders', value),
    registerView: (value) => register('views', value),
    registerSelectionAction: (value) => register('selectionActions', value),
    registerToolbarAction: (value) => register('toolbarActions', value),
    registerPanel: (value) => register('panels', value),
    registerSettings: (value) => register('settings', value),
  };
}

export type { PluginHostAPI, PluginManifest };

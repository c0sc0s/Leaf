import type { ContributionKind, DocumentProvider } from '@leaf/contracts';
import { Store } from '@leaf/shared/events';
import type { Disposable } from '@leaf/shared/lifecycle';

export interface ContributionEntry {
  pluginId: string;
  kind: ContributionKind;
  id: string;
  implementation: unknown;
}

export class PluginRegistry {
  readonly revision = new Store(0);
  private entries = new Map<string, ContributionEntry>();

  register(
    pluginId: string,
    kind: ContributionKind,
    id: string,
    implementation: unknown,
  ): Disposable {
    const key = `${kind}:${id}`;
    if (this.entries.has(key)) throw new Error(`Duplicate contribution: ${key}`);
    const entry = { pluginId, kind, id, implementation };
    this.entries.set(key, entry);
    this.changed();
    return {
      dispose: () => {
        if (this.entries.get(key) !== entry) return;
        this.entries.delete(key);
        this.changed();
      },
    };
  }

  list(kind: ContributionKind): ContributionEntry[] {
    return [...this.entries.values()].filter((entry) => entry.kind === kind);
  }

  resolve<T>(kind: ContributionKind, id: string): T | undefined {
    return this.entries.get(`${kind}:${id}`)?.implementation as T | undefined;
  }

  providers(): { pluginId: string; provider: DocumentProvider }[] {
    return this.list('documentProviders').map((entry) => ({
      pluginId: entry.pluginId,
      provider: entry.implementation as DocumentProvider,
    }));
  }

  hasReader(pluginId: string): boolean {
    const providers = new Set(
      this.providers()
        .filter((entry) => entry.pluginId === pluginId)
        .map((entry) => entry.provider.id),
    );
    return this.list('views').some(
      (entry) =>
        entry.pluginId === pluginId &&
        providers.has((entry.implementation as { providerId: string }).providerId),
    );
  }

  private changed() {
    this.revision.update((value) => value + 1);
  }
}

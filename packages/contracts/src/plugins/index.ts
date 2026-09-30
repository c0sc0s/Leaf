import type { JsonValue } from '@leaf/shared/types';

export const HOST_API_VERSION = '1.0.0';
export type ContributionKind =
  'documentProviders' | 'views' | 'selectionActions' | 'toolbarActions' | 'panels' | 'settings';
export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  hostApi: string;
  entries: { renderer: string; backend?: string };
  styles?: string[];
  contributes: Partial<Record<ContributionKind, string[]>>;
  permissions: ('documents' | 'storage' | 'backend' | 'credentials' | 'network')[];
  dependencies: Record<string, string>;
}
export interface PluginBinding {
  manifest: PluginManifest;
  enabled: boolean;
  moduleURL: string;
  installedAt: number;
  packageHash: string;
}
export interface PreparedPluginPackage {
  manifest: PluginManifest;
  data: Uint8Array;
}
export interface PluginState extends PluginBinding {
  status: 'inactive' | 'activating' | 'active' | 'failed';
  error?: string;
}
export interface PackageEnvelope {
  manifest: PluginManifest;
  files: Record<string, { data: string; sha256: string }>;
}
export interface PluginDataEntry {
  pluginId: string;
  key: string;
  documentId?: string;
  value: JsonValue;
}

export function compatibleVersion(version: string, range: string): boolean {
  const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const actual = parse(version);
  const minimum = parse(range.replace(/^[\^~]/, ''));
  if (!actual || !minimum) return false;
  if (range.startsWith('^')) {
    const floor =
      actual[0] > minimum[0] ||
      (actual[0] === minimum[0] &&
        (actual[1] > minimum[1] || (actual[1] === minimum[1] && actual[2] >= minimum[2])));
    return (
      floor &&
      actual[0] === minimum[0] &&
      (minimum[0] > 0 || (actual[1] === minimum[1] && (minimum[1] > 0 || actual[2] === minimum[2])))
    );
  }
  if (range.startsWith('~'))
    return actual[0] === minimum[0] && actual[1] === minimum[1] && actual[2] >= minimum[2];
  return version === range;
}

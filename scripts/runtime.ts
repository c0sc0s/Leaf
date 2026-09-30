import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const reactModules = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'motion/react',
];
export function runtimeEntries(root: string) {
  const entries = new Map<string, { name: string; source?: string }>();
  for (const id of reactModules)
    entries.set(id, { name: id.replaceAll('/', '-').replace(/^react-jsx/, 'jsx') });
  for (const name of ['shared', 'contracts', 'ui', 'plugin-sdk']) {
    const directory = path.join(root, 'packages', name),
      descriptor = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
        exports: Record<string, string>;
      };
    for (const [key, file] of Object.entries(descriptor.exports)) {
      if (key.includes('*')) {
        const [prefix, suffix] = file.split('*'),
          parent = prefix.endsWith('/') ? prefix : path.dirname(prefix),
          start = prefix.endsWith('/') ? '' : path.basename(prefix);
        for (const filename of readdirSync(path.join(directory, parent))) {
          if (!filename.startsWith(start) || !filename.endsWith(suffix)) continue;
          const wildcard = filename.slice(start.length, filename.length - suffix.length),
            specifier = '@leaf/' + name + '/' + key.slice(2).replace('*', wildcard);
          entries.set(specifier, {
            name: name + '-' + key.slice(2).replace('*', wildcard).replaceAll('/', '-'),
            source: '/packages/' + name + '/' + file.slice(2).replace('*', wildcard),
          });
        }
      } else if (key !== './backend') {
        const specifier = '@leaf/' + name + (key === '.' ? '' : '/' + key.slice(2));
        entries.set(specifier, {
          name: name + (key === '.' ? '' : '-' + key.slice(2).replaceAll('/', '-')),
          source: '/packages/' + name + '/' + file.slice(2),
        });
      }
    }
  }
  return entries;
}
export function importMap(root: string, development: boolean) {
  return Object.fromEntries(
    [...runtimeEntries(root)].map(([id, entry]) => [
      id,
      development
        ? (entry.source ?? '/scripts/runtime/' + id.replaceAll('/', '_') + '.js')
        : '/runtime/' + entry.name + '.js',
    ]),
  );
}
export function sharedModule(id: string) {
  return reactModules.includes(id) || /^@leaf\/(?:shared|contracts|ui|plugin-sdk)(?:\/|$)/.test(id);
}

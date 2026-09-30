import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..'),
  violations = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') await inspect(file);
      continue;
    }
    if (!/\.[cm]?[jt]sx?$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue;
    const relative = path.relative(root, file).split(path.sep).join('/'),
      source = await readFile(file, 'utf8');
    for (const match of source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g,
    )) {
      const imported = match[1],
        target = imported.startsWith('.')
          ? path
              .relative(root, path.resolve(path.dirname(file), imported))
              .split(path.sep)
              .join('/')
          : imported;
      const plugin = relative.match(/^plugins\/([^/]+)\//)?.[1];
      let reason;
      if (
        (relative.startsWith('src/') || relative.startsWith('electron/')) &&
        (target.startsWith('plugins/') || /^@leaf\/plugin-(?!sdk(?:\/|$))/.test(target))
      )
        reason = 'host imports a plugin implementation';
      if (
        plugin &&
        (target.startsWith('src/') ||
          target.startsWith('electron/') ||
          (target.startsWith('plugins/') && !target.startsWith(`plugins/${plugin}/`)))
      )
        reason = 'plugin imports host internals or another plugin';
      if (plugin && /\bwindow\.desktop\b|\blocalStorage\b|\bindexedDB\b/.test(source))
        reason = 'plugin bypasses the host protocol';
      if (
        relative.startsWith('packages/') &&
        (target.startsWith('src/') ||
          target.startsWith('electron/') ||
          target.startsWith('plugins/'))
      )
        reason = 'public package imports an implementation';
      if (
        relative.startsWith('src/core/') &&
        !target.startsWith('src/core/') &&
        !target.startsWith('@leaf/contracts') &&
        !target.startsWith('@leaf/shared')
      )
        reason = 'core imports UI or platform code';
      if (
        (relative.startsWith('packages/shared/') || relative.startsWith('packages/contracts/')) &&
        !target.startsWith('packages/shared/') &&
        !target.startsWith('packages/contracts/') &&
        !target.startsWith('@leaf/shared')
      )
        reason = 'shared primitives or contracts import runtime implementations';
      if (reason) violations.push(`${relative}: ${reason}: ${imported}`);
    }
  }
}
for (const directory of ['src', 'electron', 'packages', 'plugins'])
  await inspect(path.join(root, directory));
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log('Architecture boundaries passed.');

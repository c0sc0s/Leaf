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
    const unit = /^(?:tests\/unit\/|(?:packages|plugins)\/[^/]+\/tests\/unit\/)/.test(relative);
    const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relative);
    if (
      testFile &&
      !/^(?:tests\/(?:unit|integration)\/|(?:packages|plugins)\/[^/]+\/tests\/(?:unit|integration)\/).*\.test\.tsx?$/.test(
        relative,
      ) &&
      !/^tests\/e2e\/(?:browser|desktop)\/.*\.spec\.ts$/.test(relative)
    )
      violations.push(`${relative}: test has no declared layer`);
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
        !testFile &&
        !target.startsWith('packages/shared/') &&
        !target.startsWith('packages/contracts/') &&
        !target.startsWith('@leaf/shared')
      )
        reason = 'shared primitives or contracts import runtime implementations';
      if (
        unit &&
        relative.startsWith('tests/unit/core/') &&
        (target.startsWith('src/app/') ||
          target.startsWith('src/platform/') ||
          target.startsWith('electron/') ||
          target.startsWith('plugins/') ||
          target.startsWith('packages/ui/') ||
          target.startsWith('packages/plugin-sdk/') ||
          target.startsWith('@leaf/ui') ||
          target.startsWith('@leaf/plugin-'))
      )
        reason = 'domain unit test imports UI, platform, or a plugin implementation';
      if (
        unit &&
        relative.startsWith('tests/unit/platform/') &&
        (target.startsWith('electron/') ||
          target.startsWith('plugins/') ||
          /^@leaf\/plugin-(?!sdk(?:\/|$))/.test(target))
      )
        reason = 'renderer platform unit test imports native or plugin code';
      if (
        unit &&
        relative.startsWith('tests/unit/electron/') &&
        (target.startsWith('src/') ||
          target.startsWith('plugins/') ||
          /^@leaf\/plugin-(?!sdk(?:\/|$))/.test(target))
      )
        reason = 'native unit test imports renderer or plugin code';
      if (reason) violations.push(`${relative}: ${reason}: ${imported}`);
    }
  }
}
for (const directory of ['src', 'electron', 'packages', 'plugins', 'tests'])
  await inspect(path.join(root, directory));
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
} else console.log('Architecture boundaries passed.');

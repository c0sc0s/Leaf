import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyCatalog } from '../electron/plugins/catalog.ts';
import { readPackage } from '../electron/plugins/package.ts';
import { officialCatalogSource } from '../electron/plugins/catalog-source.ts';

const root = path.resolve('release/plugin-catalog');
const source = new URL(officialCatalogSource.url);
const [, owner, repo, , , tag] = source.pathname.split('/');
const repository = owner + '/' + repo;
const catalog = verifyCatalog(
  await readFile(path.join(root, 'catalog.json')),
  officialCatalogSource.publicKey,
);
const files = [];
for (const entry of catalog.plugins) {
  const file = path.join(root, path.basename(new URL(entry.download.url).pathname));
  const data = await readFile(file),
    verified = readPackage(data);
  if (verified.hash !== entry.download.sha256 || data.byteLength !== entry.download.size)
    throw new Error('Published package differs from signed catalog.');
  files.push(file);
}
if ((await readdir(root)).filter((file) => file.endsWith('.leaf-plugin')).length !== files.length)
  throw new Error('Unexpected packages in publishing directory.');
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
let draft = false;
try {
  draft = JSON.parse(gh('release', 'view', tag, '--repo', repository, '--json', 'isDraft')).isDraft;
} catch (error) {
  if (!String(error.stderr).includes('release not found')) throw error;
  gh(
    'release',
    'create',
    tag,
    '--repo',
    repository,
    '--target',
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    '--draft',
    '--latest=false',
    '--title',
    'Leaf 官方插件目录',
    '--notes',
    '此发布保存应用内发现与安装所使用的签名插件目录和独立插件包。',
  );
  draft = true;
}
// Packages have immutable names; publish the catalog only after every referenced asset is available.
const apiUrl = JSON.parse(
  gh('release', 'view', tag, '--repo', repository, '--json', 'apiUrl'),
).apiUrl;
const published = JSON.parse(gh('api', apiUrl)).assets;
for (const file of files) {
  const asset = published.find((asset) => asset.name === path.basename(file));
  const expected = catalog.plugins.find(
    (entry) => path.basename(new URL(entry.download.url).pathname) === path.basename(file),
  ).download;
  if (asset) {
    if (asset.size !== expected.size || asset.digest !== 'sha256:' + expected.sha256)
      throw new Error('An immutable published package has changed.');
  } else gh('release', 'upload', tag, file, '--repo', repository);
}
gh('release', 'upload', tag, path.join(root, 'catalog.json'), '--repo', repository, '--clobber');
if (draft) gh('release', 'edit', tag, '--repo', repository, '--draft=false', '--latest=false');
console.log(
  `Published ${catalog.plugins.length} plugins: https://github.com/${repository}/releases/tag/${tag}`,
);

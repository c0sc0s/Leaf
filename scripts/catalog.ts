import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { sign, createPublicKey } from 'node:crypto';
import path from 'node:path';
import { readPackage } from '../electron/plugins/package.ts';
import { verifyCatalog } from '../electron/plugins/catalog.ts';
import { officialCatalogSource } from '../electron/plugins/catalog-source.ts';
import type { PluginCatalog } from '@leaf/contracts/catalog';

const options = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--') || !process.argv[i + 1])
    throw new Error('Usage: npm run catalog:build -- --key-file <path> [--out <directory>]');
  options.set(process.argv[i], process.argv[i + 1]);
}
const keyFile = options.get('--key-file');
if (!keyFile) throw new Error('Catalog signing requires --key-file.');
const key = await readFile(keyFile);
if (
  createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString() !==
  officialCatalogSource.publicKey
)
  throw new Error('Signing key does not match the application trust key.');
const destination = path.resolve(options.get('--out') ?? 'release/plugin-catalog');
const catalog: PluginCatalog = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
  plugins: [],
};
const descriptions: Record<string, string> = {
  'leaf.pdf':
    '阅读 PDF 文档，搜索全文、添加划线和批注，并导出带有批注的 PDF。支持页码定位、书签和续读。',
  'leaf.markdown':
    '阅读单个 Markdown 文件或包含多个章节的文件夹。支持目录、搜索、代码块、本地图片、划线和笔记。',
  'leaf.ai':
    '围绕当前文档提问，使用原文搜索和可跳转的引用核对回答。需要自行配置兼容 OpenAI 的模型服务与 API Key；提问时会向所配置的服务发送问题及相关原文。',
};
await mkdir(destination, { recursive: true });
for (const [id, details] of Object.entries(descriptions)) {
  const data = new Uint8Array(await readFile(path.resolve('dist-plugins', id + '.leaf-plugin')));
  const verified = readPackage(data);
  if (verified.manifest.id !== id) throw new Error('Plugin package ID does not match its file.');
  const filename = `${id}-${verified.manifest.version}-${verified.hash}.leaf-plugin`;
  await writeFile(path.join(destination, filename), data);
  catalog.plugins.push({
    manifest: verified.manifest,
    author: 'Leaf',
    details,
    platforms: ['darwin', 'win32', 'linux'],
    download: {
      url: new URL(filename, officialCatalogSource.url).href,
      size: data.byteLength,
      sha256: verified.hash,
    },
  });
}
const payload = Buffer.from(JSON.stringify(catalog));
const envelope = Buffer.from(
  JSON.stringify({
    payload: payload.toString('base64'),
    signature: sign(null, payload, key).toString('base64'),
  }),
);
verifyCatalog(envelope, officialCatalogSource.publicKey);
await writeFile(path.join(destination, 'catalog.json'), envelope);
console.log(`Signed catalog and ${catalog.plugins.length} packages written to ${destination}`);

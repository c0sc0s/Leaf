import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export async function verifyUpdateAssets(
  directory,
  version,
  manifests = ['latest.yml', 'latest-mac.yml'],
) {
  for (const manifest of manifests) {
    const metadata = yaml.load(await readFile(path.join(directory, manifest), 'utf8'));
    if (metadata?.version !== version || !Array.isArray(metadata.files) || !metadata.files.length)
      throw new Error(`${manifest}: missing files or incorrect release version`);
    for (const entry of metadata.files) {
      if (typeof entry.url !== 'string' || path.basename(entry.url) !== entry.url)
        throw new Error(`${manifest}: invalid artifact name`);
      const file = path.join(directory, entry.url);
      const info = await stat(file);
      if (!info.isFile() || !info.size || (entry.size !== undefined && entry.size !== info.size))
        throw new Error(`${entry.url}: invalid artifact size`);
      const hash = createHash('sha512');
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      if (hash.digest('base64') !== entry.sha512)
        throw new Error(`${entry.url}: checksum does not match ${manifest}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  await verifyUpdateAssets(path.resolve(process.argv[2] ?? 'release'), version);
  console.log('Update metadata and artifact checksums verified.');
}

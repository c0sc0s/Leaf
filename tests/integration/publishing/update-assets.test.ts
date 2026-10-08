import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { version } from '../../../package.json';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function assets() {
  const directory = await mkdtemp(path.join(tmpdir(), 'leaf-update-assets-'));
  directories.push(directory);
  const data = Buffer.from('test release binary');
  const sha512 = createHash('sha512').update(data).digest('base64');
  for (const [manifest, name] of [
    ['latest.yml', 'Leaf.exe'],
    ['latest-mac.yml', 'Leaf.zip'],
  ]) {
    await writeFile(path.join(directory, name), data);
    await writeFile(
      path.join(directory, manifest),
      `version: ${version}\nfiles:\n  - url: ${name}\n    size: ${data.length}\n    sha512: ${sha512}\n`,
    );
  }
  return directory;
}

const verify = (directory: string) =>
  promisify(execFile)(process.execPath, ['scripts/verify-update-assets.mjs', directory]);

describe('release update assets', () => {
  it('accepts matching metadata and binaries from the same release', async () => {
    await expect(verify(await assets())).resolves.toMatchObject({
      stdout: expect.stringContaining('verified'),
    });
  });
  it('rejects a missing installer, wrong version or corrupt binary before publishing', async () => {
    const directory = await assets();
    await rm(path.join(directory, 'Leaf.zip'));
    await expect(verify(directory)).rejects.toThrow();
    const wrong = await assets();
    await writeFile(path.join(wrong, 'latest.yml'), 'version: 0.0.1\nfiles: []');
    await expect(verify(wrong)).rejects.toThrow('incorrect release version');
    const corrupt = await assets();
    await writeFile(path.join(corrupt, 'Leaf.exe'), 'bad! release binary');
    await expect(verify(corrupt)).rejects.toThrow('checksum does not match');
  });
});

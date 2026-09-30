import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFolder, readDocument } from '../../../../electron/platform/files.ts';
describe('native file input', () => {
  it('reads generic folders without format filtering or hidden dependencies', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'leaf-files-'));
    try {
      await mkdir(path.join(root, 'part'));
      await mkdir(path.join(root, '.git'));
      await mkdir(path.join(root, 'node_modules'));
      for (const [name, content] of [
        ['README.md', '# Read me'],
        ['part/2.md', '# Chapter'],
        ['part/pic.svg', '<svg/>'],
        ['.git/hidden.md', 'skip'],
        ['node_modules/a.md', 'skip'],
        ['document.pdf', 'pdf'],
      ])
        await writeFile(path.join(root, name), content);
      const folder = await readFolder(root);
      expect(folder.files.map((entry) => entry.name).sort()).toEqual([
        'README.md',
        'document.pdf',
        'part/2.md',
        'part/pic.svg',
      ]);
      expect((await readDocument(path.join(root, 'README.md'))).name).toBe('README.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

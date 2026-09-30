import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
vi.mock('../src/lib/db', () => ({
  fingerprint: async (data: ArrayBuffer) => {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  },
}));
import { browserFolder, importMarkdown, resolveBookLink } from '../src/lib/markdown';
const file = (name: string, content: string) => ({ name, blob: new Blob([content]) });
import { readFolder, readDocument } from '../electron/import.ts';

describe('Markdown books', () => {
  it('matches desktop folder filtering in the browser importer', () => {
    const paths = [
      'Book/README.md',
      'Book/part/2.md',
      'Book/images/a.png',
      'Book/.git/hidden.md',
      'Book/node_modules/ignore.md',
      'Book/large.pdf',
    ];
    const files = paths.map((relative) => {
      const entry = new File(['content'], relative.split('/').at(-1)!);
      Object.defineProperty(entry, 'webkitRelativePath', { value: relative });
      return entry;
    });
    const source = browserFolder(files);
    expect(source.name).toBe('Book');
    expect(source.files.map((entry) => entry.name)).toEqual([
      'README.md',
      'part/2.md',
      'images/a.png',
    ]);
  });
  it('imports a standalone file as one book and uses its heading as the title', async () => {
    const book = await importMarkdown([file('notes.md', '\uFEFF# 我的笔记\n\n内容')], 'notes.md');
    expect(book.format).toBe('markdown');
    expect(book.title).toBe('我的笔记');
    expect(book.pages).toBe(1);
    expect(book.chapters?.[0].content).toBe('# 我的笔记\n\n内容');
    expect(book.id).toMatch(/^md:/);
  });
  it('keeps a recursive folder in one book, sorts naturally and includes images', async () => {
    const files = [
      file('10.md', '# Ten'),
      file('part/3.markdown', '# Nested'),
      file('2.md', '# Two'),
      file('README.md', '# Intro'),
      file('images/a.png', 'image'),
      file('a.pdf', 'ignored'),
    ];
    const book = await importMarkdown(files, '学习笔记', true);
    expect(book.title).toBe('学习笔记');
    expect(book.pages).toBe(4);
    expect(book.chapters?.map((chapter) => chapter.path)).toEqual([
      'README.md',
      '2.md',
      '10.md',
      'part/3.markdown',
    ]);
    expect(book.assets?.map((asset) => asset.path)).toEqual(['images/a.png']);
    expect((await importMarkdown([...files].reverse(), '学习笔记', true)).id).toBe(book.id);
    expect(
      (
        await importMarkdown(
          files.map((entry) =>
            entry.name === 'images/a.png' ? file(entry.name, 'changed') : entry,
          ),
          '学习笔记',
          true,
        )
      ).id,
    ).not.toBe(book.id);
  });
  it('rejects a folder with no Markdown and supports empty Markdown', async () => {
    await expect(importMarkdown([file('image.png', 'x')], 'Empty', true)).rejects.toThrow(
      '没有 Markdown',
    );
    const book = await importMarkdown([file('empty.md', '')], 'empty.md');
    expect(book.title).toBe('empty');
    expect(book.pages).toBe(1);
  });
  it('resolves relative chapter, image and encoded heading links inside the book', () => {
    expect(resolveBookLink('part/chapter.md', '../images/%E5%9B%BE.png')).toEqual({
      path: 'images/图.png',
      hash: '',
    });
    expect(resolveBookLink('part/chapter.md', '../README.md#%E7%AE%80%E4%BB%8B')).toEqual({
      path: 'README.md',
      hash: '简介',
    });
    expect(resolveBookLink('part/chapter.md', '#same')).toEqual({
      path: 'part/chapter.md',
      hash: 'same',
    });
    for (const link of [
      '../../secret.md',
      'file:///secret',
      'javascript:alert(1)',
      '//example.com',
      '%zz',
    ])
      expect(resolveBookLink('part/chapter.md', link)).toBeNull();
  });
  it('reads desktop folders recursively, skipping hidden directories and non-book files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'leaf-md-'));
    try {
      await mkdir(path.join(root, 'part'));
      await mkdir(path.join(root, '.git'));
      await mkdir(path.join(root, 'node_modules'));
      await writeFile(path.join(root, 'README.md'), '# Read me');
      await writeFile(path.join(root, 'part', '2.markdown'), '# Chapter');
      await writeFile(path.join(root, 'part', 'pic.svg'), '<svg/>');
      await writeFile(path.join(root, '.git', 'hidden.md'), 'ignore');
      await writeFile(path.join(root, 'node_modules', 'ignore.md'), 'ignore');
      await writeFile(path.join(root, 'ignore.pdf'), 'ignore');
      const folder = await readFolder(root);
      expect(folder.files.map((entry: { name: string }) => entry.name).sort()).toEqual([
        'README.md',
        'part/2.markdown',
        'part/pic.svg',
      ]);
      expect((await readDocument(path.join(root, 'README.md'))).name).toBe('README.md');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

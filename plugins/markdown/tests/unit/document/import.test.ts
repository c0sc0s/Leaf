import { describe, expect, it } from 'vitest';
import { importMarkdown, resolveBookLink } from '../../../src/document/import';
const file = (name: string, text: string) => ({ name, data: new TextEncoder().encode(text) });
describe('Markdown import', () => {
  it('uses the heading as title and a canonical resource path', () => {
    const draft = importMarkdown({
      name: 'notes.md',
      files: [file('notes.md', '\uFEFF# 我的笔记\n内容')],
    });
    expect(draft).toMatchObject({
      formatId: 'markdown',
      title: '我的笔记',
      data: { chapters: [{ path: 'document.md', title: '我的笔记' }] },
    });
    expect(draft.files[0].name).toBe('document.md');
  });
  it('orders folder chapters naturally and keeps image resources', () => {
    const draft = importMarkdown({
      name: '学习笔记',
      folder: true,
      files: [
        file('10.md', '# Ten'),
        file('2.md', '# Two'),
        file('README.md', '# Intro'),
        file('images/a.png', 'image'),
        file('other.pdf', 'ignored'),
      ],
    });
    expect(draft.title).toBe('学习笔记');
    expect((draft.data as { chapters: unknown }).chapters).toEqual([
      { path: 'README.md', title: 'Intro' },
      { path: '2.md', title: 'Two' },
      { path: '10.md', title: 'Ten' },
    ]);
    expect(draft.files.map((entry) => entry.name)).toContain('images/a.png');
    expect(draft.files.some((entry) => entry.name.endsWith('.pdf'))).toBe(false);
    expect(() =>
      importMarkdown({ name: 'empty', folder: true, files: [file('image.png', '')] }),
    ).toThrow('没有 Markdown');
    expect(importMarkdown({ name: 'empty.md', files: [file('empty.md', '')] }).title).toBe('empty');
  });
  it('resolves chapter and image links within the document', () => {
    expect(resolveBookLink('part/chapter.md', '../images/%E5%9B%BE.png')).toEqual({
      path: 'images/图.png',
      hash: '',
    });
    expect(resolveBookLink('part/chapter.md', '../README.md#%E7%AE%80%E4%BB%8B')).toEqual({
      path: 'README.md',
      hash: '简介',
    });
    for (const link of [
      '../../secret',
      'file:///secret',
      'javascript:alert(1)',
      '//example.com',
      '%zz',
    ])
      expect(resolveBookLink('part/chapter.md', link)).toBeNull();
  });
});

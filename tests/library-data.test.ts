import { describe, expect, it } from 'vitest';
import type { Book } from '../src/types';
import { bookContent, bookMetadata } from '../src/lib/bookData';
import { SerialQueue } from '../src/lib/serialQueue';

it('keeps content separate while retaining bookmarks and progress metadata', () => {
  const book: Book = {
    id: 'book',
    format: 'markdown',
    title: 'Book',
    author: '',
    filename: 'book.md',
    cover: '',
    pages: 2,
    page: 2,
    addedAt: 1,
    openedAt: 2,
    favorite: true,
    bookmarks: [2],
    bookmarkLocations: { 2: { page: 2, ratio: 0.4 } },
    blob: new Blob(['source']),
    chapters: [{ path: 'book.md', title: 'Chapter', content: '# Chapter' }],
    assets: [{ path: 'image.svg', blob: new Blob(['image']) }],
  };
  const metadata = bookMetadata(book);
  expect(metadata).not.toHaveProperty('blob');
  expect(metadata).not.toHaveProperty('chapters');
  expect(metadata).not.toHaveProperty('assets');
  expect(metadata).toMatchObject({
    page: 2,
    openedAt: 2,
    favorite: true,
    bookmarks: [2],
    bookmarkLocations: book.bookmarkLocations,
  });
  expect(bookMetadata(metadata)).toEqual(metadata);
  const content = bookContent(book);
  expect({ ...metadata, ...content }).toEqual(book);
  expect(content.chapters).toBe(book.chapters);
  expect(content.blob).toBe(book.blob);
});

describe('import queue', () => {
  it('serializes batches, including those added while a previous import is pending', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.enqueue(async () => {
      order.push('first:start');
      await pending;
      order.push('first:end');
      return 1;
    });
    await Promise.resolve();
    const second = queue.enqueue(async () => {
      order.push('second');
      return 2;
    });
    expect(order).toEqual(['first:start']);
    release();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(order).toEqual(['first:start', 'first:end', 'second']);
  });

  it('reports failed imports without losing later batches', async () => {
    const queue = new SerialQueue();
    const failed = queue.enqueue(async () => {
      throw new Error('broken document');
    });
    const later = queue.enqueue(async () => 'next book');
    await expect(failed).rejects.toThrow('broken document');
    await expect(later).resolves.toBe('next book');
  });
});

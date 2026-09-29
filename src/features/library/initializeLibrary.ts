import { readPreference, writePreference } from '../../lib/preferences';
import { storage } from '../../lib/db';
import type { BookMetadata } from '../../types';

let initialLoad: Promise<BookMetadata[]> | undefined;

async function initialize() {
  const books = await storage.books();
  if (books.length || readPreference('folio-initialized')) return books;
  const manifest = (await fetch('./samples/manifest.json').then((r) => r.json())) as {
    slug: string;
  }[];
  const { importPDF } = await import('../../lib/pdf');
  for (const [index, entry] of manifest.entries()) {
    const response = await fetch(`./samples/${entry.slug}.pdf`);
    if (!response.ok) throw new Error('示例文件加载失败');
    const book = await importPDF(await response.blob(), entry.slug + '.pdf');
    await storage.putBook({ ...book, sample: true, addedAt: Date.now() - index * 1000 });
  }
  await writePreference('folio-initialized', '1');
  return storage.books();
}

export function initializeLibrary() {
  if (!initialLoad) {
    const load = initialize();
    initialLoad = load;
    const clear = () => {
      if (initialLoad === load) initialLoad = undefined;
    };
    void load.then(clear, clear);
  }
  return initialLoad;
}

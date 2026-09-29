import { readPreference } from '../../lib/preferences';
import { storage } from '../../lib/db';
import type { BookMetadata } from '../../types';

let initialLoad: Promise<BookMetadata[]> | undefined;

async function initialize() {
  const books = await storage.books();
  // Sample books are test fixtures; only the Playwright dev server sets this flag.
  if (
    !import.meta.env.VITE_LEAF_SEED_SAMPLES ||
    books.length ||
    readPreference('folio-initialized')
  )
    return books;
  const { seedSamples } = await import('./seedSamples');
  await seedSamples();
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

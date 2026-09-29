import manifest from '../../../tests/fixtures/samples/manifest.json';
import { writePreference } from '../../lib/preferences';
import { storage } from '../../lib/db';

const sampleUrls = import.meta.glob<string>('../../../tests/fixtures/samples/*.pdf', {
  query: '?url',
  import: 'default',
  eager: true,
});

export async function seedSamples() {
  const { importPDF } = await import('../../lib/pdf');
  for (const [index, entry] of manifest.entries()) {
    const url = sampleUrls[`../../../tests/fixtures/samples/${entry.slug}.pdf`];
    if (!url) throw new Error(`Missing sample fixture: ${entry.slug}.pdf`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load sample fixture: ${entry.slug}.pdf`);
    const book = await importPDF(await response.blob(), entry.slug + '.pdf');
    await storage.putBook({ ...book, sample: true, addedAt: Date.now() - index * 1000 });
  }
  await writePreference('folio-initialized', '1');
}

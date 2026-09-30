import manifest from '../../../tests/fixtures/samples/manifest.json';
import type { AppServices } from '../compose';
const sampleUrls = import.meta.glob<string>('../../../tests/fixtures/samples/*.pdf', {
  query: '?url',
  import: 'default',
  eager: true,
});
let running: Promise<void> | undefined;
export function seedSamples(services: AppServices) {
  if (!running)
    running = (async () => {
      const preferences = await services.storage.request('settings.list', undefined);
      if (preferences['tests.samples']) return;
      for (const entry of manifest) {
        const response = await fetch(
          sampleUrls[`../../../tests/fixtures/samples/${entry.slug}.pdf`],
        );
        if (!response.ok) throw new Error('示例文档不可用');
        const report = await services.library.import([
          {
            name: entry.slug + '.pdf',
            files: [
              {
                name: entry.slug + '.pdf',
                data: new Uint8Array(await response.arrayBuffer()),
                mime: 'application/pdf',
              },
            ],
          },
        ]);
        if (report.failures.length) throw new Error(report.failures[0].message);
        for (const document of report.added)
          await services.library.update(document.id, { sample: true });
      }
      await services.storage.request('settings.set', { key: 'tests.samples', value: true });
    })();
  return running;
}

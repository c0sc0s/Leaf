# Reader performance

The first optimization pass moves Markdown parsing, syntax highlighting, heading
extraction, search matching and PDF export into document-owned Web Workers.
React still renders the visible chapter and PDF canvases on the UI thread.

- Markdown keeps up to six parsed chapter trees, with an estimated 8 MiB weight
  budget. Search and annotations decorate a copy; they never reparse a cached
  chapter or accumulate on its original tree. Closing a book terminates its worker.
- PDF search keeps canonical text and lowercase copies separately from the
  30-page geometry cache. Its text index holds at most 8,388,608 UTF-16 code units
  and 5,000 pages; larger documents evict old entries. Changing a query cancels
  pending requests and prevents stale results from appearing.
- Background search yields after an 8 ms time slice and pauses while scrolling.
  It no longer waits at least 40 ms on every page. PDF token/span matching uses
  indexed forward lookups instead of repeated array copies and linear searches.
- Opening panels and selecting text retain Markdown DOM nodes. Heading tracking
  measures only logarithmically many headings and runs at most once per frame.
- PDF export loads `pdf-lib` lazily in a worker and transfers the resulting buffer
  back to the UI. Native annotation semantics and the original PDF remain intact.

## Measurement

On this Windows development machine, a synthetic 120-page PDF with one matching
line per page took 7,075 ms for the first search and 7,114 ms for a second keyword
before the changes. Afterward, the same fixture took 506 ms and 355 ms, including
the unchanged 300 ms input debounce. These are local observations, not guarantees
for image-heavy or scanned documents.

The production entry JavaScript changed from 1,475.76 kB (502.77 kB gzip) to
572.51 kB (180.38 kB gzip), after the computation changes and lazy loading both
reader formats. Computation libraries now also ship in worker/lazy chunks; this
reduces eager UI loading, rather than removing those libraries. The PDF runtime
loads when importing/opening PDFs or initializing the first sample library.

The library now loads metadata without document bytes or Markdown chapters.
Progress, favorites and bookmarks write only metadata; document content is read
when opening a book. Annotation counts use the book ID index without cloning
every note and geometry record. Module boundaries and schema migration are
described in [architecture.md](architecture.md).

## Verification

`npm test` covers cache eviction, canonical search offsets, cancellation and
worker shutdown, plus immutable Markdown decorations and PDF annotation export.
`npx playwright test tests/e2e/performance.spec.ts` verifies that a second PDF
search sends no text back to the index, panel changes retain DOM nodes, and chapter
navigation during worker startup uses the latest page. Existing reading tests
cover Markdown safety, exact code copying, annotations, headings, reading position,
PDF virtualization and native export. Production Electron checks exercise all
three workers over `file://`, including transferred PDF output. Run
`npm run test:production` to build and repeat those checks without an installer.

`tests/e2e/library-storage.spec.ts` upgrades real legacy PDF and Markdown records,
checks saved images/notes/bookmarks/position, verifies metadata-only writes, and
ensures delayed progress writes cannot recreate deleted books. Native desktop
import tests also cover consecutive OS file events and recovery after a damaged
document.

Rust/WebGL have not been added in this pass. Remaining work should be driven by
profiles of real large documents, particularly DOM/layout cost and PDF drawing.

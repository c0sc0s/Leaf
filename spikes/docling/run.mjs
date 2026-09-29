// Stands in for the Electron main process: spawns the parser, submits jobs over stdio,
// samples memory, then checks each block's source region against PDF.js text.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const home = process.env.HOME;
const jobs = [
  { name: 'designing-systems', pdf: path.join(root, '../../public/samples/designing-systems.pdf') },
  { name: 'attention', pdf: path.join(root, 'samples/attention.pdf') },
  { name: 'resnet', pdf: path.join(root, 'samples/resnet.pdf') },
  {
    name: 'fluent-python',
    pdf: path.join(home, 'Downloads/Fluent.Python.2nd.Edition.(z-lib.org).pdf'),
    pages: [60, 79],
  },
  { name: 'netview-zh', pdf: path.join(home, 'Downloads/dpxmst.pdf'), pages: [20, 39] },
];
const selected = process.argv.slice(2);
const params = { code: process.env.CODE === '1', ocr: process.env.OCR === '1' };
const variant = process.env.CODE === '1' ? 'code' : 'base';

function startWorker() {
  const child = spawn(path.join(root, '.venv/bin/python'), ['-m', 'leaf_reflow.worker'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const waiting = new Map();
  let ready;
  const readyEvent = new Promise((resolve) => (ready = resolve));
  createInterface({ input: child.stdout }).on('line', (line) => {
    const event = JSON.parse(line);
    if (event.event === 'ready') return ready(event);
    if (event.event === 'started') return;
    const job = waiting.get(event.id);
    waiting.delete(event.id);
    if (event.event === 'result') job.resolve(event.result);
    else job.reject(new Error(event.error));
  });
  child.on('exit', (code) => {
    for (const job of waiting.values()) job.reject(new Error(`Parser exited with ${code}`));
  });
  let peak = 0;
  const sampler = setInterval(() => {
    try {
      peak = Math.max(peak, Number(execFileSync('ps', ['-o', 'rss=', '-p', String(child.pid)])));
    } catch {
      clearInterval(sampler);
    }
  }, 200);
  return {
    readyEvent,
    peakMB: () => Math.round(peak / 1024),
    resetPeak: () => (peak = 0),
    convert(id, request) {
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        child.stdin.write(JSON.stringify({ id, method: 'convert', params: request }) + '\n');
      });
    },
    stop() {
      clearInterval(sampler);
      child.kill();
    },
  };
}

async function pdfTokens(file, pages) {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;
  const byPage = new Map();
  for (const number of pages) {
    const page = await pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    const [originX, originY] = viewport.viewBox;
    const content = await page.getTextContent();
    const tokens = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      // Same geometry as src/lib/pdf.ts, so these rects are what Leaf annotations store.
      const tx = Util.transform(viewport.transform, item.transform);
      const height = Math.hypot(tx[2], tx[3]) || item.height || 12;
      const width = item.width;
      const [x, y] = viewport.convertToPdfPoint(tx[4] + width / 2, tx[5] - height / 2);
      tokens.push({ text: item.str, x: x - originX, y: y - originY });
    }
    byPage.set(number, tokens);
  }
  await pdf.destroy();
  return byPage;
}

const squash = (text) => text.replace(/\s+/g, '').normalize('NFKC');
function bigrams(text) {
  const counts = new Map();
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  return counts;
}
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const left = bigrams(a);
  let shared = 0;
  for (const [pair, count] of bigrams(b)) shared += Math.min(count, left.get(pair) || 0);
  return (2 * shared) / (a.length - 1 + b.length - 1);
}

const TEXTUAL = new Set(['heading', 'paragraph', 'list-item', 'code', 'caption', 'footnote']);
function alignment(blocks, tokens, firstPage) {
  const byKind = {};
  for (const block of blocks) {
    if (!TEXTUAL.has(block.kind) || !block.text.trim()) continue;
    const covered = block.sources.flatMap(({ page, bbox: [x0, y0, x1, y1] }) =>
      (tokens.get(page + firstPage - 1) || []).filter(
        (t) => t.x >= x0 - 2 && t.x <= x1 + 2 && t.y >= y0 - 2 && t.y <= y1 + 2,
      ),
    );
    const score = similarity(squash(block.text), squash(covered.map((t) => t.text).join('')));
    const stats = (byKind[block.kind] ||= { blocks: 0, exact: 0, above90: 0, total: 0 });
    stats.blocks++;
    stats.total += score;
    if (score === 1) stats.exact++;
    if (score >= 0.9) stats.above90++;
  }
  return Object.fromEntries(
    Object.entries(byKind).map(([kind, s]) => [
      kind,
      { blocks: s.blocks, exact: s.exact, above90: s.above90, mean: +(s.total / s.blocks).toFixed(3) },
    ]),
  );
}

const worker = startWorker();
const ready = await worker.readyEvent;
const report = { variant, importSeconds: +ready.importSeconds.toFixed(2), jobs: [] };
console.log(`worker ready: import ${report.importSeconds}s, rss ${worker.peakMB()} MB`);
for (const job of jobs.filter((j) => !selected.length || selected.includes(j.name))) {
  const out = path.join(root, 'out', variant, job.name);
  worker.resetPeak();
  const wall = performance.now();
  const result = await worker.convert(job.name, { ...params, pdf: job.pdf, out, pages: job.pages });
  const seconds = (performance.now() - wall) / 1000;
  const firstPage = job.pages?.[0] ?? 1;
  const blocks = JSON.parse(readFileSync(path.join(out, 'blocks.json'), 'utf8')).blocks;
  // Docling renumbers pages within a page range from the range start.
  const pageNumbers = [...new Set(blocks.flatMap((b) => b.sources.map((s) => s.page)))];
  const shift = job.pages && Math.min(...pageNumbers) === 1 ? firstPage : 1;
  const tokens = await pdfTokens(job.pdf, pageNumbers.map((p) => p + shift - 1));
  const entry = {
    name: job.name,
    ...result,
    wallSeconds: +seconds.toFixed(2),
    secondsPerPage: +(result.convertSeconds / result.pages).toFixed(2),
    peakMB: worker.peakMB(),
    kinds: blocks.reduce((acc, b) => ({ ...acc, [b.kind]: (acc[b.kind] || 0) + 1 }), {}),
    alignment: alignment(blocks, tokens, shift),
  };
  report.jobs.push(entry);
  console.log(JSON.stringify(entry));
}
worker.stop();
writeFileSync(path.join(root, 'out', variant, 'report.json'), JSON.stringify(report, null, 1));

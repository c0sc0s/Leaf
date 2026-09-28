import { cp, mkdir, access, rename, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
await mkdir('public/vendor/ocr/core', { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm'])
  await cp(`node_modules/pdfjs-dist/${name}`, `public/vendor/${name}`, { recursive: true });
await cp('node_modules/tesseract.js/dist/worker.min.js', 'public/vendor/ocr/worker.min.js');
await rm('public/vendor/ocr/core', { recursive: true, force: true });
await mkdir('public/vendor/ocr/core', { recursive: true });
for (const file of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'LICENSE',
])
  await cp(`node_modules/tesseract.js-core/${file}`, `public/vendor/ocr/core/${file}`);

await mkdir('public/vendor/lang', { recursive: true });
const checksums = {
  eng: 'ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468',
  chi_sim: '59388039851e4d1293d729c183fd8c1fa9bbbb959eed996e945024671e68c1d6',
};
for (const language of ['eng', 'chi_sim']) {
  const target = `public/vendor/lang/${language}.traineddata.gz`;
  try {
    await access(target);
  } catch {
    execFileSync(
      'curl',
      [
        '-fL',
        '--retry',
        '3',
        '--max-time',
        '180',
        '-o',
        target + '.tmp',
        `https://tessdata.projectnaptha.com/4.0.0/${language}.traineddata.gz`,
      ],
      { stdio: 'inherit' },
    );
    await rename(target + '.tmp', target);
  }
}
for (const [language, expected] of Object.entries(checksums)) {
  const actual = createHash('sha256')
    .update(await readFile(`public/vendor/lang/${language}.traineddata.gz`))
    .digest('hex');
  if (actual !== expected) throw new Error(`Invalid OCR model checksum: ${language}`);
}
await mkdir('licenses', { recursive: true });
for (const [name, license] of [
  ['react', 'LICENSE'],
  ['react-dom', 'LICENSE'],
  ['pdfjs-dist', 'LICENSE'],
  ['pdf-lib', 'LICENSE.md'],
  ['idb', 'LICENSE'],
  ['lucide-react', 'LICENSE'],
  ['tesseract.js', 'LICENSE.md'],
  ['tesseract.js-core', 'LICENSE'],
]) {
  const text = await readFile(`node_modules/${name}/${license}`, 'utf8');
  await writeFile(`licenses/${name}.txt`, text.trimEnd() + '\n');
}

console.log('Local PDF, OCR engine, verified language models and licenses prepared.');

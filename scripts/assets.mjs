import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
for (const name of ['ocr', 'lang'])
  await rm(`public/vendor/${name}`, { recursive: true, force: true });
await mkdir('public/vendor', { recursive: true });
for (const name of ['cmaps', 'standard_fonts', 'wasm'])
  await cp(`node_modules/pdfjs-dist/${name}`, `public/vendor/${name}`, { recursive: true });
await mkdir('licenses', { recursive: true });
for (const [name, license] of [
  ['react', 'LICENSE'],
  ['react-dom', 'LICENSE'],
  ['pdfjs-dist', 'LICENSE'],
  ['pdf-lib', 'LICENSE.md'],
  ['idb', 'LICENSE'],
  ['lucide-react', 'LICENSE'],
]) {
  const text = await readFile(`node_modules/${name}/${license}`, 'utf8');
  await writeFile(`licenses/${name}.txt`, text.trimEnd() + '\n');
}

console.log('Local PDF assets and licenses prepared.');

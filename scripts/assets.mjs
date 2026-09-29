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
  ['react-markdown', 'license'],
  ['remark-gfm', 'license'],
  ['unified', 'license'],
  ['remark-parse', 'license'],
  ['remark-rehype', 'license'],
  ['rehype-highlight', 'license'],
  ['lowlight', 'license'],
  ['highlight.js', 'LICENSE'],
  ['radix-ui', 'LICENSE'],
  ['shadcn', 'LICENSE.md'],
  ['@hugeicons/react', 'LICENSE.md'],
  ['@hugeicons/core-free-icons', 'LICENSE.md'],
  ['@fontsource-variable/geist', 'LICENSE'],
  ['@fontsource-variable/public-sans', 'LICENSE'],
  ['@fontsource/ibm-plex-sans', 'LICENSE'],
  ['@fontsource-variable/jetbrains-mono', 'LICENSE'],
  ['class-variance-authority', 'LICENSE'],
  ['clsx', 'license'],
  ['tailwind-merge', 'LICENSE.md'],
  ['motion', 'LICENSE.md'],
  ['tw-animate-css', 'LICENSE'],
]) {
  const text = await readFile(`node_modules/${name}/${license}`, 'utf8');
  await writeFile(`licenses/${name.replaceAll('/', '-')}.txt`, text.trimEnd() + '\n');
}

console.log('Local PDF assets and licenses prepared.');

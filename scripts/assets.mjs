import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
  ['openai', 'LICENSE'],
  ['electron-updater', 'LICENSE'],
]) {
  const text = await readFile(`node_modules/${name}/${license}`, 'utf8');
  await writeFile(`licenses/${name.replaceAll('/', '-')}.txt`, text.trimEnd() + '\n');
}

console.log('Third-party licenses prepared.');

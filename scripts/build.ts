import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, writeFile, readdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';
import { writePackage } from '../electron/plugins/package.ts';
import type { PluginManifest } from '@leaf/contracts/plugins';
import { runtimeEntries, sharedModule, reactModules } from './runtime.ts';

const root = path.resolve(import.meta.dirname, '..');
const decodeAlias = {
  'decode-named-character-reference': createRequire(import.meta.url).resolve(
    'decode-named-character-reference',
  ),
};

async function nodeEntry(entry: string, output: string, format: 'es' | 'cjs' = 'es') {
  await build({
    configFile: false,
    publicDir: false,
    root,
    logLevel: 'warn',
    build: {
      target: 'node22',
      emptyOutDir: false,
      outDir: path.join(root, 'dist-electron'),
      lib: { entry: path.join(root, entry), formats: [format], fileName: () => output },
      rolldownOptions: {
        external: (id) =>
          id === 'electron' ||
          id === 'electron-updater' ||
          id.startsWith('node:') ||
          builtinModules.includes(id),
        output: { codeSplitting: false },
      },
      minify: false,
    },
  });
}
async function electron() {
  await rm(path.join(root, 'dist-electron'), { recursive: true, force: true });
  await nodeEntry('electron/main.ts', 'main.js');
  await nodeEntry('electron/preload.cts', 'preload.cjs', 'cjs');
  await nodeEntry('electron/storage/worker.ts', 'storage/worker.js');
  await nodeEntry('electron/storage/client.ts', 'storage/client.js');
  await nodeEntry('electron/plugins/backend/worker.ts', 'plugins/backend/worker.js');
}
async function runtime() {
  const directory = path.join(root, 'node_modules/.tmp/leaf-runtime');
  await mkdir(directory, { recursive: true });
  const entries: Record<string, string> = {};
  for (const [module, entry] of runtimeEntries(root)) {
    if (reactModules.includes(module)) {
      entries[entry.name] = path.join(root, 'scripts/runtime', module.replaceAll('/', '_') + '.js');
      continue;
    }
    const file = path.join(directory, entry.name + '.js');
    entries[entry.name] = file;
    await writeFile(file, `export * from '${module}';`);
  }
  await build({
    configFile: false,
    publicDir: false,
    root,
    logLevel: 'warn',
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir: path.join(root, 'public/runtime'),
      emptyOutDir: true,
      target: 'es2022',
      lib: { entry: entries, formats: ['es'], cssFileName: 'style' },
      rolldownOptions: {
        onwarn(warning, handler) {
          if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') handler(warning);
        },
        output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
      },
      minify: true,
    },
  });
}
async function walk(directory: string, prefix = ''): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name,
      full = path.join(directory, entry.name);
    if (entry.isDirectory())
      for (const [name, bytes] of await walk(full, relative + '/')) files.set(name, bytes);
    else if (entry.isFile()) files.set(relative, new Uint8Array(await readFile(full)));
  }
  return files;
}
async function plugins() {
  const destination = path.join(root, 'dist-plugins');
  await mkdir(destination, { recursive: true });
  for (const name of ['pdf', 'markdown', 'ai']) {
    const base = path.join(root, 'plugins', name),
      output = path.join(destination, name);
    await build({
      configFile: false,
      publicDir: false,
      root,
      logLevel: 'warn',
      define: { 'process.env.NODE_ENV': '"production"' },
      base: './',
      plugins: [react()],
      resolve: { alias: decodeAlias },
      build: {
        outDir: output,
        emptyOutDir: true,
        target: 'es2022',
        lib: {
          entry: path.join(base, name === 'ai' ? 'src/index.tsx' : 'src/index.ts'),
          formats: ['es'],
          fileName: () => 'renderer.js',
          cssFileName: 'style',
        },
        rolldownOptions: { external: sharedModule },
        minify: true,
        assetsInlineLimit: 0,
        chunkSizeWarningLimit: 2000,
      },
    });
    if (name === 'pdf')
      await cp(
        path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
        path.join(output, 'pdf.worker.mjs'),
      );
    if (name === 'pdf')
      for (const directory of ['cmaps', 'standard_fonts', 'wasm'])
        await cp(
          path.join(root, 'node_modules/pdfjs-dist', directory),
          path.join(output, 'vendor', directory),
          { recursive: true },
        );
    const descriptor: PluginManifest = JSON.parse(
      await readFile(path.join(base, 'manifest.json'), 'utf8'),
    );
    if (descriptor.entries.backend) {
      await build({
        configFile: false,
        publicDir: false,
        root,
        logLevel: 'warn',
        build: {
          outDir: output,
          emptyOutDir: false,
          target: 'node22',
          lib: {
            entry: path.join(base, 'src/backend/index.ts'),
            formats: ['es'],
            fileName: () => 'backend.js',
          },
          rolldownOptions: {
            external: (id) => id.startsWith('node:') || builtinModules.includes(id),
            output: { codeSplitting: false },
          },
          minify: true,
        },
      });
    }
    const files = await walk(output);
    if (files.has('style.css')) descriptor.styles = ['style.css'];
    for (const dependency of name === 'pdf'
      ? ['pdfjs-dist', 'pdf-lib']
      : name === 'markdown'
        ? [
            'react-markdown',
            'remark-gfm',
            'remark-parse',
            'remark-rehype',
            'rehype-highlight',
            'unified',
            'highlight.js',
          ]
        : ['openai', 'react-markdown', 'remark-gfm']) {
      const license = path.join(root, 'licenses', dependency.replaceAll('/', '-') + '.txt');
      files.set(
        'licenses/' + dependency.replaceAll('/', '-') + '.txt',
        new Uint8Array(await readFile(license)),
      );
    }
    await writeFile(
      path.join(destination, descriptor.id + '.leaf-plugin'),
      writePackage(descriptor, files),
    );
  }
}
const mode = process.argv[2] ?? 'all';
if (mode === 'runtime' || mode === 'all') await runtime();
if (mode === 'plugins' || mode === 'all') await plugins();
if (mode === 'electron' || mode === 'all') await electron();

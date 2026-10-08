import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import services from './scripts/vite/services.ts';
import { importMap, sharedModule, reactModules } from './scripts/runtime.ts';
const root = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    services(),
    {
      name: 'leaf-runtime-map',
      transformIndexHtml: {
        order: 'pre',
        handler: (html, context) => {
          const map = JSON.stringify({ imports: importMap(root, !!context.server) });
          const hash = createHash('sha256').update(map).digest('base64');
          return {
            html: html.replace(
              "script-src 'self' 'wasm-unsafe-eval'",
              `script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}'`,
            ),
            tags: [
              {
                tag: 'script',
                attrs: { type: 'importmap' },
                children: map,
                injectTo: 'head-prepend',
              },
              ...(!context.server
                ? [
                    {
                      tag: 'link',
                      attrs: { rel: 'stylesheet', href: './runtime/style.css' },
                      injectTo: 'head' as const,
                    },
                  ]
                : []),
            ],
          };
        },
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The browser export uses document.createElement; use the package's
      // DOM-free implementation so Markdown also runs in a Web Worker.
      'decode-named-character-reference': createRequire(import.meta.url).resolve(
        'decode-named-character-reference',
      ),
    },
  },
  optimizeDeps: { include: reactModules, entries: ['index.html'] },
  base: './',
  server: {
    host: '127.0.0.1',
    strictPort: true,
    // Plugin installation renames staged directories; development data must not be watched.
    watch: { ignored: ['**/.leaf-data', '**/.leaf-data/**'] },
    hmr: { protocol: 'ws', host: '127.0.0.1', clientPort: 5173 },
  },
  build: { chunkSizeWarningLimit: 1500, rolldownOptions: { external: sharedModule } },
});

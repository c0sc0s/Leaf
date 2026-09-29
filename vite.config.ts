import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { createRequire } from 'node:module';
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  // Worker imports are outside the HTML graph. Discover them before the first
  // document opens so pre-bundling cannot reload the page in the middle of reading.
  optimizeDeps: { entries: ['index.html', 'src/**/*.worker.ts'] },
  base: './',
  server: { host: '127.0.0.1', strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
});

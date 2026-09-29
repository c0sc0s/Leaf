import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  base: './',
  server: { host: '127.0.0.1', port: 8766, strictPort: true },
  preview: { host: '127.0.0.1', port: 8767, strictPort: true },
});

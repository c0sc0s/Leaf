import path from 'node:path';
import { readFile, realpath } from 'node:fs/promises';
import { resourcePath } from '@leaf/contracts/validation';

export function mime(file: string) {
  const types: Record<string, string> = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
  };
  return types[path.extname(file)] ?? 'application/octet-stream';
}
export async function fileResponse(file: string) {
  return new Response(new Uint8Array(await readFile(file)), {
    headers: { 'Content-Type': mime(file), 'X-Content-Type-Options': 'nosniff' },
  });
}
export async function applicationFile(root: string, name: string) {
  const directory = await realpath(root),
    file = await realpath(path.join(directory, resourcePath(name)));
  if (!file.startsWith(directory + path.sep)) throw new Error('Invalid application resource');
  return file;
}

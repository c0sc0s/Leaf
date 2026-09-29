import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const directory = new URL('./', import.meta.url);
const tileSize = 896;
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}"><rect width="${tileSize}" height="${tileSize}" rx="200" fill="white"/></svg>`);
const tile = await sharp(fileURLToPath(new URL('icon-source.png', directory)))
  .resize(tileSize, tileSize)
  .ensureAlpha()
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
  .composite([{ input: tile, left: 64, top: 64 }])
  .png()
  .toFile(fileURLToPath(new URL('icon.png', directory)));

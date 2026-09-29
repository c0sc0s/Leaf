import fs from 'node:fs/promises';
import sharp from 'sharp';

const manifestPath = 'public/mascot/manifest.json';
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
for (const asset of manifest.assets) {
  const { width, height } = await sharp(asset.source).metadata();
  await fs.copyFile(asset.source, `public${asset.file}`);
  asset.width = width;
  asset.height = height;
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Copied ${manifest.assets.length} original illustrations without image processing.`);

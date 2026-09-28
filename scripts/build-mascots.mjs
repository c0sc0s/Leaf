import fs from 'node:fs/promises';
import sharp from 'sharp';

const manifestPath = 'public/mascot/manifest.json';
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
for (const asset of manifest.assets) {
  const source = `assets/mascot/sources/${asset.id}.png`;
  const { width, height } = await sharp(source).metadata();
  await fs.copyFile(source, `public${asset.file}`);
  asset.source = source;
  asset.width = width;
  asset.height = height;
  delete asset.grid;
}
manifest.version = 6;
manifest.style = 'original-illustration';
manifest.themeIndependent = true;
delete manifest.processing;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Copied ${manifest.assets.length} original illustrations without image processing.`);

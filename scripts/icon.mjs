/*
 * Builds every app icon from one line drawing, assets/icon/reading-cat.png:
 * - build/icon.png   macOS: 1024 canvas, 824 continuous-corner tile with a soft shadow,
 *                    following Apple's icon grid; electron-builder turns it into ICNS.
 * - build/icon.ico   Windows: 16–256 px layers, the tile filling the canvas.
 * - public/icon.png  In-app, favicon and window icon: the tile filling the canvas.
 * - site/public/    Website icons copied from the app's PNG and multi-size ICO.
 * The drawing is lifted off its paper as ink and laid on our own tile, so the tile colour,
 * shape and margins are ours. Small layers thicken the ink before shrinking, because the
 * artwork's strokes would otherwise fade below a pixel.
 */
import sharp from 'sharp';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

const SOURCE = 'assets/icon/reading-cat.png';
const INK = '#1c1b18';
const PAPER_TOP = '#fffdf6';
const PAPER_BOTTOM = '#f3efe2';
/** Share of the tile the drawing may span, leaving it room to breathe. */
const ARTWORK_SPAN = 0.74;
/** The head alone is simpler, so at the smallest size it can fill more of the tile. */
const HEAD_SPAN = 0.92;
const WINDOWS_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Share of the drawing's height, from the top, that holds the cat's head. */
const HEAD_SHARE = 0.6;

/**
 * The drawing as a greyscale PNG where ink is white and paper black, trimmed to the
 * drawing. Steps pass encoded PNGs so sharp always knows each image's own geometry.
 */
async function readInk() {
  const lifted = await sharp(SOURCE)
    .toColourspace('b-w')
    .negate()
    // Paper becomes fully clear and the brush strokes fully opaque.
    .linear(1.6, -40)
    .png()
    .toBuffer();
  return sharp(lifted).trim({ background: '#000000', threshold: 10 }).png().toBuffer();
}

/** Points of a superellipse, the continuous-corner square Apple uses for app icons. */
function superellipse(size, offset) {
  const half = size / 2;
  const points = [];
  for (let step = 0; step < 360; step++) {
    const angle = (step / 360) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = Math.sign(cos) * Math.abs(cos) ** (2 / 5) * half;
    const y = Math.sign(sin) * Math.abs(sin) ** (2 / 5) * half;
    points.push(`${(offset + half + x).toFixed(2)},${(offset + half + y).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

function tileSvg(canvas, tile, offset) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">
    <defs><linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PAPER_TOP}"/><stop offset="1" stop-color="${PAPER_BOTTOM}"/>
    </linearGradient></defs>
    <path d="${superellipse(tile, offset)}" fill="url(#paper)"/>
  </svg>`);
}

/** The cat's head alone, down to the top of the book, for sizes too small for the whole scene. */
async function headOf(ink) {
  const { width, height } = await sharp(ink).metadata();
  return sharp(ink)
    .extract({ left: 0, top: 0, width, height: Math.round(height * HEAD_SHARE) })
    .trim({ background: '#000000', threshold: 10 })
    .png()
    .toBuffer();
}

/** The drawing, as coloured ink, scaled to sit centred on a tile of `tile` pixels. */
async function inkLayer(ink, tile, { thicken, headOnly }) {
  const span = Math.round(tile * (headOnly ? HEAD_SPAN : ARTWORK_SPAN));
  const drawing = headOnly ? await headOf(ink) : ink;
  // sharp treats dark pixels as the foreground, so eroding them widens the light ink.
  const shaped = thicken ? await sharp(drawing).erode(thicken).png().toBuffer() : drawing;
  const alpha = await sharp(shaped)
    .resize(span, span, { fit: 'contain', background: '#000000', kernel: 'lanczos3' })
    // Letterboxing adds an alpha channel; the ink lives in the first one.
    .extractChannel(0)
    .png()
    .toBuffer();
  return sharp({ create: { width: span, height: span, channels: 3, background: INK } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
}

/** A square icon of `canvas` pixels with the tile inset by `inset` on every side. */
async function renderIcon(
  ink,
  canvas,
  inset,
  { thicken = 0, headOnly = false, shadow = false } = {},
) {
  const tile = canvas - inset * 2;
  const layers = [];
  if (shadow) {
    // A soft drop below the tile, as macOS icons sit slightly above the Dock.
    const drop = await sharp(tileSvg(canvas, tile, inset))
      .ensureAlpha()
      .extractChannel('alpha')
      .blur(canvas * 0.016)
      .linear(0.28, 0)
      .raw()
      .toBuffer();
    const shade = await sharp({
      create: { width: canvas, height: canvas, channels: 3, background: '#000000' },
    })
      .joinChannel(drop, { raw: { width: canvas, height: canvas, channels: 1 } })
      .png()
      .toBuffer();
    layers.push({ input: shade, top: Math.round(canvas * 0.012), left: 0 });
  }
  layers.push({ input: tileSvg(canvas, tile, inset), top: 0, left: 0 });
  const art = await inkLayer(ink, tile, { thicken, headOnly });
  const artSize = Math.round(tile * (headOnly ? HEAD_SPAN : ARTWORK_SPAN));
  const artOffset = inset + Math.round((tile - artSize) / 2);
  layers.push({ input: art, top: artOffset, left: artOffset });
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
}

/** Packs PNG layers into a Windows ICO, which stores each size as its own image. */
function icoFile(layers) {
  const header = Buffer.alloc(6 + layers.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(layers.length, 4);
  let offset = header.length;
  layers.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...layers.map((layer) => layer.png)]);
}

/** Thicker strokes for smaller layers, measured in source pixels. */
const thickenFor = (size) => (size <= 16 ? 14 : size <= 24 ? 18 : size <= 48 ? 10 : 0);

const ink = await readInk();
await mkdir('build', { recursive: true });
await writeFile('build/icon.png', await renderIcon(ink, 1024, 100, { shadow: true }));
const windowsLayers = [];
for (const size of WINDOWS_SIZES)
  windowsLayers.push({
    size,
    png: await renderIcon(ink, size, 0, { thicken: thickenFor(size), headOnly: size <= 16 }),
  });
await writeFile('build/icon.ico', icoFile(windowsLayers));
await writeFile('public/icon.png', await renderIcon(ink, 512, 0));
await mkdir('site/public', { recursive: true });
await copyFile('public/icon.png', 'site/public/icon.png');
await copyFile('build/icon.ico', 'site/public/favicon.ico');
console.log('Icons written to build/, public/icon.png and site/public/.');

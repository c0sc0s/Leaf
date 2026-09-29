export interface PaletteColor {
  hue: number;
  saturation: number;
  lightness: number;
  /** Where the colour sits on the cover, 0–1 from the left and top. */
  x: number;
  y: number;
  share: number;
}

const SAMPLE_WIDTH = 24;
const SAMPLE_HEIGHT = 36;
const CLUSTERS = 5;
const ITERATIONS = 10;
const PALETTE_SIZE = 4;

type Rgb = [number, number, number];
interface Pixel {
  rgb: Rgb;
  x: number;
  y: number;
}

const distance = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function toHsl([r, g, b]: Rgb): [number, number, number] {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return [hue * 60, saturation, lightness];
}

/** Farthest-point seeding keeps small accent colours (a red badge on a white cover) as their own cluster. */
function seedCentres(pixels: Pixel[]) {
  const centres: Rgb[] = [pixels[0].rgb];
  while (centres.length < CLUSTERS) {
    let farthest = pixels[0];
    let best = -1;
    for (const pixel of pixels) {
      const nearest = Math.min(...centres.map((centre) => distance(pixel.rgb, centre)));
      if (nearest > best) {
        best = nearest;
        farthest = pixel;
      }
    }
    centres.push([...farthest.rgb]);
  }
  return centres;
}

/**
 * Clusters cover pixels (RGBA, row-major) and ranks the clusters by chroma with a damped
 * area weight, so near-white paper and black text rarely lead the palette. HSL saturation
 * is not used for ranking because it reads near-white as highly saturated.
 */
export function extractPalette(data: Uint8ClampedArray, width: number, height: number) {
  if (data.length !== width * height * 4) throw new Error('Pixel data does not match its size');
  const pixels: Pixel[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      pixels.push({
        rgb: [data[i], data[i + 1], data[i + 2]],
        x: (x + 0.5) / width,
        y: (y + 0.5) / height,
      });
    }
  if (!pixels.length) return [];
  const centres = seedCentres(pixels);
  let sums = centres.map(() => ({ r: 0, g: 0, b: 0, x: 0, y: 0, n: 0 }));
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    sums = centres.map(() => ({ r: 0, g: 0, b: 0, x: 0, y: 0, n: 0 }));
    for (const pixel of pixels) {
      let index = 0;
      let nearest = Infinity;
      centres.forEach((centre, i) => {
        const d = distance(pixel.rgb, centre);
        if (d < nearest) {
          nearest = d;
          index = i;
        }
      });
      const sum = sums[index];
      sum.r += pixel.rgb[0];
      sum.g += pixel.rgb[1];
      sum.b += pixel.rgb[2];
      sum.x += pixel.x;
      sum.y += pixel.y;
      sum.n++;
    }
    sums.forEach((sum, i) => {
      if (sum.n) centres[i] = [sum.r / sum.n, sum.g / sum.n, sum.b / sum.n];
    });
  }
  return sums
    .filter((sum) => sum.n)
    .map((sum) => {
      const rgb: Rgb = [sum.r / sum.n, sum.g / sum.n, sum.b / sum.n];
      const [hue, saturation, lightness] = toHsl(rgb);
      const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;
      const share = sum.n / pixels.length;
      return {
        color: { hue, saturation, lightness, x: sum.x / sum.n, y: sum.y / sum.n, share },
        score: Math.sqrt(share) * (0.1 + chroma),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, PALETTE_SIZE)
    .map(({ color }) => color);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const hsl = (hue: number, saturation: number, lightness: number, alpha = 1) =>
  `hsl(${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}% / ${alpha})`;

/** Keeps every colour within a band where the theme's own text stays readable on top of it. */
function tone(color: PaletteColor, dark: boolean): [number, number, number] {
  return dark
    ? [color.hue, clamp(color.saturation * 1.1, 0, 0.72), clamp(color.lightness, 0.2, 0.4)]
    : [color.hue, clamp(color.saturation * 0.9, 0, 0.6), clamp(color.lightness, 0.76, 0.88)];
}

/** Layers one soft radial glow per colour at the position it occupies on the cover. */
export function atmosphereBackground(palette: PaletteColor[], dark: boolean) {
  if (!palette.length) throw new Error('An atmosphere needs at least one colour');
  const glows = palette.map((color, index) => {
    const [hue, saturation, lightness] = tone(color, dark);
    const x = Math.round(10 + color.x * 80);
    const y = Math.round(color.y * 70);
    return `radial-gradient(ellipse ${60 + index * 8}% ${80 + index * 10}% at ${x}% ${y}%, ${hsl(hue, saturation, lightness)} 0, ${hsl(hue, saturation, lightness, 0)} 70%)`;
  });
  const [hue, saturation, lightness] = tone(palette[0], dark);
  const base = hsl(hue, saturation * 0.8, dark ? lightness * 0.7 : Math.min(0.9, lightness + 0.03));
  return [...glows, base].join(', ');
}

export async function readCoverPalette(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable');
  context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const { data } = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  return extractPalette(data, SAMPLE_WIDTH, SAMPLE_HEIGHT);
}

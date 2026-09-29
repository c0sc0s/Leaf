import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const directory = new URL('./', import.meta.url);
const designs = [
  {
    id: 'fold',
    background: '#334D43',
    secondary: '#ABC4AD',
    primary: '#F5F3E8',
    mark: `<path d="M165 222c0-40 31-72 71-72h114l-80 94h-83c-12 0-22-10-22-22Z" fill="PRIMARY"/><path d="M347 290c0 40-31 72-71 72H162l80-94h83c12 0 22 10 22 22Z" fill="SECONDARY"/>`,
  },
  {
    id: 'arc',
    background: '#202A35',
    secondary: '#DFEAB8',
    primary: '#DFEAB8',
    mark: `<path d="M211 156v126c0 34 22 56 56 56h64" fill="none" stroke="PRIMARY" stroke-width="64" stroke-linecap="round" transform="rotate(-12 256 256)"/>`,
  },
  {
    id: 'space',
    background: '#EEEEE7',
    secondary: '#AC714D',
    primary: '#29312D',
    mark: `<path d="M292 156h-73c-35 0-63 28-63 63v74c0 35 28 63 63 63h74c35 0 63-28 63-63v-46" fill="none" stroke="PRIMARY" stroke-width="44" stroke-linecap="round"/><path d="m339 157 17 17" fill="none" stroke="SECONDARY" stroke-width="34" stroke-linecap="round"/>`,
  },
];

for (const design of designs) {
  const coloredMark = design.mark.replaceAll('PRIMARY', design.primary).replaceAll('SECONDARY', design.secondary);
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect x="32" y="32" width="448" height="448" rx="102" fill="${design.background}"/>${coloredMark}</svg>`;
  const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="112 112 288 288">${design.mark.replaceAll('PRIMARY', '#29312D').replaceAll('SECONDARY', '#29312D')}</svg>`;
  await fs.writeFile(new URL(`${design.id}.svg`, directory), icon);
  await fs.writeFile(new URL(`${design.id}-mark.svg`, directory), monochrome);
  await sharp(Buffer.from(icon)).resize(1024, 1024).png().toFile(fileURLToPath(new URL(`${design.id}.png`, directory)));
}

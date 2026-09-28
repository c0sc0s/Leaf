import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="48" y="48" width="928" height="928" rx="214" fill="#e9ece2"/><rect x="75" y="75" width="874" height="874" rx="195" fill="none" stroke="#d8decd" stroke-width="5"/><path d="M640 225c-110-26-193 21-214 133l-12 65h-89l-14 68h89l-55 285h90l55-285h115l13-68H503l12-66c12-64 48-89 110-75z" fill="#354333"/><circle cx="654" cy="727" r="36" fill="#b56043"/></svg>`;
await writeFile('public/icon.svg', svg);
await sharp(Buffer.from(svg)).png().toFile('public/icon.png');

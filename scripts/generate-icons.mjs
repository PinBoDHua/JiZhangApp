import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const rounded = await readFile(new URL('../public/icons/icon.svg', import.meta.url));
const maskable = await readFile(new URL('../public/icons/maskable.svg', import.meta.url));

const targets = [
  { source: rounded, size: 32, file: 'favicon-32.png' },
  { source: rounded, size: 192, file: 'icon-192.png' },
  { source: rounded, size: 512, file: 'icon-512.png' },
  { source: maskable, size: 180, file: 'apple-touch-icon.png' },
  { source: maskable, size: 512, file: 'icon-maskable-512.png' },
];

for (const target of targets) {
  const output = fileURLToPath(new URL(`../public/icons/${target.file}`, import.meta.url));
  await sharp(target.source).resize(target.size, target.size).png().toFile(output);
  console.log(`generated icons/${target.file}`);
}

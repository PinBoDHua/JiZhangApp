import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const resDir = path.join(root, 'android/app/src/main/res');
const source = await readFile(path.join(root, 'public/icons/icon.svg'));
const sourceSquare = await sharp(source).resize(1024, 1024).png().toBuffer();

const circleMask = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="256" fill="#fff"/></svg>',
);
const roundSource = await sharp(sourceSquare)
  .composite([{ input: circleMask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const densities = [
  { dir: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

const adaptiveForeground = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <circle cx="54" cy="54" r="31" fill="#F4EBD9" stroke="#D9C9AC" stroke-width="1"/>
  <path d="M54 34v20l13 8.5" fill="none" stroke="#16251F" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="54" cy="54" r="3.2" fill="#D45A3C"/>
</svg>`);

for (const { dir, launcher, foreground } of densities) {
  const folder = path.join(resDir, dir);
  await sharp(source).resize(launcher, launcher).png().toFile(path.join(folder, 'ic_launcher.png'));
  await sharp(roundSource).resize(launcher, launcher).png().toFile(path.join(folder, 'ic_launcher_round.png'));
  await sharp(adaptiveForeground)
    .resize(foreground, foreground)
    .png()
    .toFile(path.join(folder, 'ic_launcher_foreground.png'));
}

const splashFiles = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];

const cream = { r: 244, g: 240, b: 231, alpha: 1 };

for (const [dir, width, height] of splashFiles) {
  const logoSize = Math.round(Math.min(width, height) * 0.28);
  const logo = await sharp(source).resize(logoSize, logoSize).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: cream } })
    .composite([
      {
        input: logo,
        left: Math.round((width - logoSize) / 2),
        top: Math.round((height - logoSize) / 2),
      },
    ])
    .png()
    .toFile(path.join(resDir, dir, 'splash.png'));
}

console.log('Android launcher icons and splash screens generated.');

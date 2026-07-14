/**
 * Einmaliges Skript: erzeugt die PWA-Icons (PNG) aus einer Inline-SVG.
 * Nutzung:  npm i --no-save sharp && node scripts/generate-icons.mjs
 * Die erzeugten PNGs sind eingecheckt – das Skript braucht man nur,
 * wenn man das Icon ändern will.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'public', 'icons');

// Dunkles Metall + drei rote Klauen-Schlitze – ohne Fonts, damit das
// Rendering überall identisch ist.
const icon = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#23232e"/>
      <stop offset="0.5" stop-color="#101016"/>
      <stop offset="1" stop-color="#1a1a24"/>
    </linearGradient>
    <linearGradient id="claw" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff5a66"/>
      <stop offset="1" stop-color="#b3121f"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="512" height="512" rx="${padding ? 0 : 96}" fill="url(#bg)"/>
  <g transform="rotate(-18 256 256) ${padding ? 'translate(256 256) scale(0.72) translate(-256 -256)' : ''}">
    <path d="M156 96 C 176 200, 176 312, 150 416 C 196 330, 204 190, 186 92 Z" fill="url(#claw)"/>
    <path d="M246 76 C 270 200, 270 320, 240 436 C 292 336, 300 180, 278 72 Z" fill="url(#claw)"/>
    <path d="M336 96 C 356 200, 356 312, 330 416 C 376 330, 384 190, 366 92 Z" fill="url(#claw)"/>
  </g>
  ${padding ? '' : '<rect x="6" y="6" width="500" height="500" rx="92" fill="none" stroke="#3a3a48" stroke-width="6"/>'}
</svg>`;

const sharp = (await import('sharp')).default;
await mkdir(OUT, { recursive: true });

const jobs = [
  ['icon-192.png', icon(false), 192],
  ['icon-512.png', icon(false), 512],
  ['maskable-512.png', icon(true), 512],
  ['apple-touch-icon.png', icon(true), 180],
];

for (const [file, svg, size] of jobs) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(path.join(OUT, file), png);
  console.log(`✓ ${file} (${size}x${size}, ${png.length} bytes)`);
}

#!/usr/bin/env node
/**
 * Rendert die 6 Instagram-Slides (1080×1350) aus slides.html nach out/.
 * Nutzt Playwright (Chromium) – lokal installiert oder global
 * (npm i -g playwright && npx playwright install chromium).
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

function loadPlaywright() {
  for (const base of [
    import.meta.url,
    join(execSync('npm root -g').toString().trim(), 'x'),
  ]) {
    try {
      return createRequire(base)('playwright');
    } catch {}
  }
  throw new Error('Playwright nicht gefunden – npm i -g playwright');
}
const { chromium } = loadPlaywright();

const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'out'), { recursive: true });

const browser = await chromium.launch({
  args: ['--no-sandbox', '--force-color-profile=srgb'],
});
const page = await browser.newPage({
  viewport: { width: 1080, height: 1350 },
  deviceScaleFactor: 1,
});

for (let i = 1; i <= 6; i++) {
  await page.goto(`file://${join(here, 'slides.html')}?slide=${i}`);
  await page.evaluate(() => document.fonts.ready);
  const file = join(here, 'out', `slide-${i}.png`);
  await page.screenshot({ path: file });
  console.log(`out/slide-${i}.png`);
}

await browser.close();

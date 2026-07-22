// Rendert die Instagram-Grafiken aus den HTML-Vorlagen (Chromium-Screenshot).
// Nutzung:  npm i playwright-core && node render.js
// Optional: CHROME_PATH=/pfad/zu/chrome node render.js
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const JOBS = [
  { file: 'profile.html', w: 1080, h: 1080 },
  { file: 'ad-1-hero.html', w: 1080, h: 1350 },
  { file: 'ad-2-timetable.html', w: 1080, h: 1080 },
  { file: 'ad-3-story.html', w: 1080, h: 1920 },
];

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = ['/opt/pw-browsers'];
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      const p = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  }
  // Fallback: von Playwright verwalteter Browser
  return undefined;
}

(async () => {
  const executablePath = findChrome();
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--force-color-profile=srgb'],
  });
  for (const { file, w, h } of JOBS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + path.resolve(__dirname, file));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const out = path.resolve(__dirname, '..', path.basename(file, '.html') + '.png');
    await page.screenshot({ path: out });
    console.log('OK', out, `${w}x${h}`);
    await page.close();
  }
  await browser.close();
})();

// Rasterizes the self-drawn assets/sample/textbook.svg into assets/sample/textbook.jpg, the bundled sample page.
// The app needs a raster (the image pipeline and Expo Go cannot decode SVG); the SVG stays the source of truth.
// Japanese text needs a CJK font (e.g. Noto Sans/Serif CJK JP) installed where this runs.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const dir = path.join(__dirname, '..', 'assets', 'sample');

(async () => {
  const svg = fs.readFileSync(path.join(dir, 'textbook.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1460 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(dir, 'textbook.jpg');
  await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
  await browser.close();
  console.log(`wrote ${out}`);
})();

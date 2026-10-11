// Renders scripts/sample-page.html into assets/sample/textbook.jpg (the bundled sample textbook page).
const path = require('path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1460 }, deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(__dirname, 'sample-page.html')}`);
  await page.waitForTimeout(300);
  const out = path.join(__dirname, '..', 'assets', 'sample', 'textbook.jpg');
  await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
  await browser.close();
  console.log(`wrote ${out}`);
})();

const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await page.goto('http://localhost:3100', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: process.argv[2] || 'shot.png', fullPage: false });
  await browser.close();
  process.exit(0);
})();

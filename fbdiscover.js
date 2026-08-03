// Scrape Facebook's live directory (logged out) for currently-live videos.
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'https://www.facebook.com/watch/live/';
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  try {
    const btn = page.locator('div[role="dialog"] [aria-label="Close"]').first();
    if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); console.log('closed login dialog'); }
  } catch {}
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(2500);
  }
  const info = await page.evaluate(() => {
    const links = new Set();
    for (const a of document.querySelectorAll('a[href*="/videos/"]')) {
      const m = a.href.match(/facebook\.com\/([^/]+)\/videos\/(\d+)/);
      if (m) links.add(`${m[1]}/videos/${m[2]}`);
    }
    return {
      title: document.title,
      textLen: document.body.innerText.length,
      snippet: document.body.innerText.slice(0, 300).replace(/\n/g, ' | '),
      videos: [...links].slice(0, 20),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  process.exit(0);
})();

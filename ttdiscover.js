// Scrape tiktok.com/live for usernames that are live right now.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto('https://www.tiktok.com/live', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(2000);
  }
  const info = await page.evaluate(() => {
    const seen = new Set();
    for (const a of document.querySelectorAll('a[href*="/live"]')) {
      const m = a.href.match(/tiktok\.com\/@([^/?]+)\/live/);
      if (m) seen.add(m[1]);
    }
    return {
      users: [...seen].slice(0, 25),
      title: document.title,
      textLen: document.body.innerText.length,
      snippet: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
      links: document.querySelectorAll('a').length,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  process.exit(0);
})();

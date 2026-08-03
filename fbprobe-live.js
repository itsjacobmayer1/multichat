// Which Facebook pages are live right now (logged out)?
// Usage: node fbprobe-live.js page1 page2 ...  — checks fb.com/<page>/live_videos/
const { chromium } = require('playwright-core');
const pages = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const name of pages) {
    try {
      await page.goto(`https://www.facebook.com/${name}/live_videos/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000);
      const info = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
          liveNow: /is live now|LIVE\b/.test(t) && /Most relevant|comments/i.test(t),
          articles: document.querySelectorAll('[role="article"]').length,
          snippet: t.slice(0, 200).replace(/\n/g, ' | '),
        };
      });
      console.log(`${name}: live=${info.liveNow} commentBlocks=${info.articles}`);
      console.log(`   ${info.snippet.slice(0, 160)}`);
    } catch (e) {
      console.log(`${name}: err ${(e.message || e).slice(0, 80)}`);
    }
  }
  await browser.close();
  process.exit(0);
})();

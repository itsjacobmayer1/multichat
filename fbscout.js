// Scout: can a logged-out browser see a Facebook page's live videos + comments?
const { chromium } = require('playwright-core');
const pages = ['aljazeeraenglish', 'ABCNews', 'NASA', 'skynews', 'foxnews'];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  for (const name of pages) {
    try {
      await page.goto(`https://www.facebook.com/${name}/live_videos/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000);
      const info = await page.evaluate(() => {
        const links = new Set();
        for (const a of document.querySelectorAll('a[href*="/videos/"], a[href*="watch/?v="], a[href*="watch/live"]')) {
          links.add(a.href.split('&')[0]);
        }
        return {
          title: document.title,
          loginWall: !!document.querySelector('form[action*="login"]') && document.body.innerText.length < 2000,
          bodyStart: document.body.innerText.slice(0, 200).replace(/\n/g, ' | '),
          videoLinks: [...links].slice(0, 5),
        };
      });
      console.log('=== ' + name + ' ===');
      console.log(JSON.stringify(info, null, 1));
    } catch (e) {
      console.log('=== ' + name + ' === failed:', e.message.slice(0, 80));
    }
  }
  await browser.close();
  process.exit(0);
})();

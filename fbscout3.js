// Scout 3: logged out, do NEW comments keep arriving over time?
// Usage: node fbscout3.js <url> [watchSecs]
// Prints the first video link found (to hop from a /live_videos/ listing into
// the actual video page) and per-15s counts of newly added comment blocks.
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'https://www.facebook.com/foxnews/live_videos/';
const watchSecs = Number(process.argv[3] || 90);
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    window.__newComments = [];
    const start = () => {
      const seen = new WeakSet();
      const extract = (node) => {
        if (!(node instanceof HTMLElement)) return;
        const blocks = node.matches('[role="article"]') ? [node] : [...node.querySelectorAll('[role="article"]')];
        for (const b of blocks) {
          if (seen.has(b)) continue;
          seen.add(b);
          const t = b.textContent.trim().slice(0, 80);
          if (t) window.__newComments.push({ t, at: performance.now() });
        }
      };
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) extract(n);
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  try {
    const btn = page.locator('div[role="dialog"] [aria-label="Close"]').first();
    if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); console.log('closed login dialog'); }
  } catch {}

  const videoLink = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href*="/videos/"]')].find((x) => /\/videos\/\d/.test(x.href));
    return a ? a.href : null;
  });
  console.log('url:', page.url());
  console.log('first video link:', videoLink);

  let prev = 0;
  for (let i = 0; i < Math.ceil(watchSecs / 15); i++) {
    await page.waitForTimeout(15000);
    const items = await page.evaluate(() => window.__newComments);
    const fresh = items.slice(prev);
    console.log(`t+${(i + 1) * 15}s: +${fresh.length} new (total ${items.length})`);
    for (const f of fresh.slice(0, 3)) console.log('   ', f.t);
    prev = items.length;
  }
  await browser.close();
  process.exit(0);
})();

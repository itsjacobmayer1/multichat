// Scout 5: run the SERVER's exact extraction logic against a page and print
// what it would relay. Usage: node fbscout5.js <liveUrl> [watchSecs]
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'https://www.facebook.com/Sparta/live_videos/';
const watchSecs = Number(process.argv[3] || 30);
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.exposeFunction('mcPush', (name, text) => {
    console.log(`PUSH [${name}]: ${String(text).slice(0, 100)}`);
  });
  await page.addInitScript(() => {
    const start = () => {
      const seen = new WeakSet();
      const extract = (node) => {
        if (!(node instanceof HTMLElement)) return;
        const blocks = node.matches('[role="article"], [aria-label^="Comment" i]')
          ? [node]
          : [...node.querySelectorAll('[role="article"], [aria-label^="Comment" i]')];
        for (const b of blocks) {
          if (seen.has(b)) continue;
          seen.add(b);
          const leaves = [...b.querySelectorAll('div[dir="auto"], span[dir="auto"]')]
            .filter((e) => !e.querySelector('div[dir="auto"], span[dir="auto"]'));
          const texts = leaves
            .map((e) => e.textContent.trim()).filter(Boolean)
            .filter((t) => !/^\d+[smhdw]$/.test(t))
            .filter((t, i, a) => t !== a[i - 1]);
          const nameEl = b.querySelector('a strong, a span[dir="auto"], strong');
          const name = nameEl ? nameEl.textContent.trim() : (texts[0] || '');
          const msg = texts.filter((t) => t && t !== name).join(' ');
          // Diagnostics: show the raw block even when nothing would be pushed.
          window.mcPush(
            name || '(no name)',
            msg || `(no msg — block text: ${b.textContent.trim().slice(0, 80)} | leaves: ${leaves.length})`
          );
        }
      };
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) extract(n);
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);
  try {
    const btn = page.locator('div[role="dialog"] [aria-label="Close"]').first();
    if (await btn.isVisible({ timeout: 2000 })) { await btn.click(); console.log('closed login dialog'); }
  } catch {}
  await page.waitForTimeout(watchSecs * 1000);
  console.log('done');
  await browser.close();
  process.exit(0);
})();

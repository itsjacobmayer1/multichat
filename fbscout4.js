// Scout 4: what markup do comments use on the logged-out video page, and do
// they live-update? Usage: node fbscout4.js <url> [watchSecs]
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'https://www.facebook.com/100059396147148/videos/1731127298094042';
const watchSecs = Number(process.argv[3] || 90);
(async () => {
  const browser = await chromium.launch({ channel: process.env.FB_BROWSER_CHANNEL || 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.addInitScript(() => {
    window.__added = [];
    const start = () => {
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const label = n.getAttribute && (n.getAttribute('aria-label') || '');
          const role = n.getAttribute && (n.getAttribute('role') || '');
          const t = (n.textContent || '').trim();
          if (t.length > 5 && t.length < 600) {
            window.__added.push({ tag: n.tagName, role, label: label.slice(0, 60), t: t.slice(0, 90), at: Date.now() });
          }
        }
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
  await page.waitForTimeout(5000);

  const survey = await page.evaluate(() => {
    const sel = {
      article: '[role="article"]',
      ariaComment: '[aria-label*="omment" i]',
      dirAutoDivs: 'div[dir="auto"]',
    };
    const out = {};
    for (const [k, s] of Object.entries(sel)) {
      const els = [...document.querySelectorAll(s)];
      out[k] = { count: els.length, samples: els.slice(0, 4).map((e) => ({
        tag: e.tagName, label: (e.getAttribute('aria-label') || '').slice(0, 60), t: e.textContent.trim().slice(0, 80),
      })) };
    }
    return out;
  });
  console.log(JSON.stringify(survey, null, 1));

  let prev = 0;
  const t0 = Date.now();
  for (let i = 0; i < Math.ceil(watchSecs / 15); i++) {
    await page.waitForTimeout(15000);
    const items = await page.evaluate(() => window.__added);
    const fresh = items.slice(prev);
    console.log(`t+${Math.round((Date.now() - t0) / 1000)}s: +${fresh.length} added nodes`);
    for (const f of fresh.slice(0, 6)) console.log(`    <${f.tag} role=${f.role} label="${f.label}"> ${f.t}`);
    prev = items.length;
  }
  await browser.close();
  process.exit(0);
})();

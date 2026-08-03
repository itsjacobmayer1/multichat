// Scout 2: do comments render on a logged-out Facebook video page?
const { chromium } = require('playwright-core');
const url = process.argv[2] || 'https://www.facebook.com/100059396147148/videos/925211643942913';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);
  // Try to close the login dialog if present.
  try {
    const closeBtn = page.locator('[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 2000 })) { await closeBtn.click(); console.log('closed login dialog'); }
  } catch {}
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasComments = /comments|Most relevant/i.test(text);
    // Comment bodies commonly live in divs with dir=auto inside articles/aria-labels
    const candidates = [...document.querySelectorAll('div[aria-label*="Comment" i], div[role="article"]')].length;
    return {
      title: document.title,
      textLen: text.length,
      mentionsComments: hasComments,
      commentNodes: candidates,
      snippet: text.slice(0, 600).replace(/\n/g, ' | '),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
  process.exit(0);
})();

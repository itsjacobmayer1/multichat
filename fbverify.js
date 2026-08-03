const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'fb-profile'), {
    channel: process.env.FB_BROWSER_CHANNEL || 'msedge',
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      loggedIn: !document.querySelector('input[name="pass"]') && !/Log in or sign up/i.test(t.slice(0, 500)),
      hasCookie: document.cookie.includes('c_user'),
      snippet: t.slice(0, 150).replace(/\n/g, ' | '),
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await ctx.close();
  process.exit(0);
})();

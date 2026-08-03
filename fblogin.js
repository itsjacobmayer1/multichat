// One-time Facebook login for the no-API browser mode.
// Opens a real Edge window using the scraper's profile. Log in to Facebook
// there (any account that can view the client's live), then close the window.
// The session is saved to fb-profile/ and the server reuses it headless.
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(__dirname, 'fb-profile'), {
    channel: process.env.FB_BROWSER_CHANNEL || 'msedge',
    headless: false,
    viewport: null,
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://www.facebook.com/');
  console.log('Log in to Facebook in the opened window, then close the browser window.');
  await new Promise((resolve) => ctx.on('close', resolve));
  console.log('Session saved to fb-profile/. The server can now watch Facebook lives headless.');
  process.exit(0);
})();

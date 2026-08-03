const { TikTokLiveConnection } = require('tiktok-live-connector');
const names = process.argv.slice(2);
(async () => {
  for (const n of names) {
    try {
      const c = new TikTokLiveConnection(n, {});
      const live = await c.fetchIsLive();
      console.log(n, '->', live ? 'LIVE' : 'offline');
    } catch (e) {
      console.log(n, '-> err:', (e.message || String(e)).slice(0, 100));
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  process.exit(0);
})();

// Try a real chat connection to each user; report chat volume over 20s.
// Usage: node ttconnect.js user1 user2 ...
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const names = process.argv.slice(2);
(async () => {
  for (const n of names) {
    const conn = new TikTokLiveConnection(n, {});
    let msgs = 0;
    conn.on(WebcastEvent.CHAT, () => { msgs++; });
    try {
      await conn.connect();
      await new Promise((r) => setTimeout(r, 20000));
      console.log(`${n} -> CONNECTED, ${msgs} chat msgs in 20s`);
    } catch (e) {
      console.log(`${n} -> ${(e.message || String(e)).slice(0, 90)}`);
    }
    try { conn.disconnect(); } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  process.exit(0);
})();

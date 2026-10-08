# Multichat

Free to use. Put all your live chats on an iPad or phone and see every one of them in one place while you stream. Twitch, YouTube, TikTok and Facebook chat show up together, split into columns or merged into one feed.

![Multichat split view, one column per platform](docs/screenshot.png)

You don't need accounts, API keys or logins for any platform. It's one small Node server and one HTML page, no framework and no build step.

## Setup

```bash
npm install
npm start
```

Put your channels in `config.json` (see below) and restart the server. Then open the page.

- On the same computer, go to http://localhost:3100
- On an iPad or phone on the same wifi, go to http://YOUR-COMPUTER-IP:3100 (run `ipconfig` on Windows or `ifconfig` on Mac to find the IP)

Set `PORT` if you want a different port.

The page opens in split view with one column per platform. The button at the top switches to the merged feed and your browser remembers which one you picked. On a phone the merged feed is easier to read. The pills at the top show if each platform is connected, waiting for a live, or reconnecting.

Channels only live in `config.json`. There's no channel picker on the page on purpose, so whoever is holding the iPad can't break it.

## Config

```jsonc
{
  "twitch":  { "channel": "xqc" },              // the name after twitch.tv/
  "youtube": {
    "channelId": "UCSJ4gkVC6NrvII8umztf0Ow",    // picks up the channel's current live on its own
    "videoId": ""                               // or pin one live video id
  },
  "tiktok":  { "username": "wwe" },             // without the @
  "facebook": {
    "liveUrl": "https://www.facebook.com/StoneMountain64/live_videos/",
                                                // any page's /live_videos/ link, no login needed
    "pageId": "",                               // or use the Graph API with a page id
    "accessToken": "",                          // and a Page token (pages_read_engagement + pages_read_user_content)
    "liveVideoId": "",                          // optional, pin one broadcast
    "socialStreamSession": ""                   // or a Social Stream Ninja session id
  }
}
```

Leave a platform empty to turn it off. For Facebook the server uses `liveUrl` first, then the Graph API, then Social Stream Ninja.

## How it works

```
Twitch (tmi.js, anon IRC) ─────┐
YouTube (youtube-chat scrape) ─┤    normalize to                 browser
TikTok (tiktok-live-connector) ├─→ {platform, user, text} ─→ one WebSocket ─→ index.html
Facebook (headless Playwright) ┘    + recent history replayed on connect
```

`server.js` is the whole backend. Express serves `public/`, and a WebSocket sends every chat message to every open page. Each platform connector reconnects on its own and can't crash the server. When a page loads it gets the last 80 messages per platform, so it isn't empty and a fast Twitch chat can't push the slower platforms out.

`public/index.html` is the whole frontend. Messages get drawn in batches once per frame, so a big Twitch chat doing 10+ messages a second doesn't lag an older iPad. Each feed keeps the newest 250 messages (150 per column in split view) and auto-scrolls unless you scroll up.

| Platform | How | Login needed | Notes |
|---|---|---|---|
| Twitch | `tmi.js` anonymous IRC | no | Works live or not |
| YouTube | `youtube-chat` scrape by channel id | no | Finds the current live, checks again every 60s if not live |
| TikTok | `tiktok-live-connector` v2 | no | Only connects while the account is live, checks every 60s |
| Facebook | headless browser on the page's `/live_videos/` listing | no | See below |

### Facebook

The Facebook API needs a Page token and normal scraping needs a logged-in account, which you don't want on a server. But a page's public `/live_videos/` listing shows the newest ~5 comments on the current live even when you're logged out. So the server opens that listing in a headless browser (Edge, then Chrome, then Playwright's Chromium), reads the comments, reloads every 45 seconds, and only sends comments it hasn't seen yet. If nothing comes through for 15 minutes it restarts the browser.

The catch is up to about a minute of delay, and a really busy Facebook chat will have gaps since you only get the newest few each reload. If you have a Page token, fill in `pageId` and `accessToken`, leave `liveUrl` empty, and it uses the Graph API stream instead.

## Hosting it

- Node 18 or newer.
- Facebook needs Chrome or Edge on the machine. On a fresh Linux server install Chrome, or run `npx playwright@1.62 install --with-deps chromium`. `FB_BROWSER_CHANNEL=chrome` forces one.
- Keep it running with pm2 (`pm2 start server.js --name multichat`) or systemd.
- Put nginx or Caddy in front for HTTPS. The WebSocket runs on the same port, so a normal `proxy_pass` with the `Upgrade` and `Connection` headers works.

## Limits

- Facebook only gets the newest few comments per reload, and a Facebook layout change could break it.
- TikTok chat only exists while the account is live.
- YouTube chat is scraped from the watch page, so a YouTube layout change could break it.
- No profanity filter or moderation. YouTube emotes show as text (`:emote:`).
- One set of channels per server. Run a second copy on another port for a second streamer.

## License

MIT, see [LICENSE](LICENSE). Use it however you want.

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('./config.json');

const PORT = Number(process.env.PORT) || 3100;

// One flaky connector must never take the whole relay down.
process.on('uncaughtException', (err) => console.error('[uncaught]', err && err.message || err));
process.on('unhandledRejection', (err) => console.error('[unhandled]', err && err.message || err));

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const status = { twitch: 'off', youtube: 'off', tiktok: 'off', facebook: 'off' };
const labels = { twitch: '', youtube: '', tiktok: '', facebook: '' }; // channel names shown in the UI
// Replayed to newly connected pages. Buffered per platform so a firehose
// chat (big Twitch stream) can't evict the slower platforms' history.
const recent = { twitch: [], youtube: [], tiktok: [], facebook: [] };

function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(s);
  }
}

function setStatus(platform, state) {
  status[platform] = state;
  broadcast({ type: 'status', platform, state, label: labels[platform] });
  console.log(`[${platform}] ${state}`);
}

function setLabel(platform, label) {
  labels[platform] = label;
  broadcast({ type: 'status', platform, state: status[platform], label });
}

function pushChat(platform, user, text, extra = {}) {
  if (!text) return;
  const msg = { type: 'chat', platform, user: user || 'unknown', text, ts: Date.now(), ...extra };
  const buf = recent[platform] || (recent[platform] = []);
  buf.push(msg);
  if (buf.length > 80) buf.shift();
  broadcast(msg);
}

wss.on('connection', (ws) => {
  const replay = Object.values(recent).flat().sort((a, b) => a.ts - b.ts);
  ws.send(JSON.stringify({ type: 'init', status, labels, recent: replay }));
});

// ---------- Twitch (anonymous IRC, no auth needed) ----------
function startTwitch() {
  const channel = (config.twitch && config.twitch.channel || '').trim();
  if (!channel) return setStatus('twitch', 'off');
  labels.twitch = channel;
  const tmi = require('tmi.js');
  const client = new tmi.Client({
    connection: { reconnect: true, secure: true },
    channels: [channel],
  });
  client.on('connected', () => setStatus('twitch', 'connected'));
  client.on('disconnected', () => setStatus('twitch', 'reconnecting'));
  client.on('message', (ch, tags, message, self) => {
    if (self) return;
    pushChat('twitch', tags['display-name'] || tags.username, message, { color: tags.color || null });
  });
  setStatus('twitch', 'connecting');
  client.connect().catch((err) => {
    setStatus('twitch', 'error');
    console.error('[twitch]', err);
  });
}

// ---------- YouTube (scrapes the live chat of the channel's current live) ----------
function startYouTube() {
  const cfg = config.youtube || {};
  const channelId = (cfg.channelId || '').trim();
  const videoId = (cfg.videoId || '').trim();
  if (!channelId && !videoId) return setStatus('youtube', 'off');
  labels.youtube = channelId || videoId;
  // Resolve the human-readable channel name for the UI.
  const nameUrl = channelId
    ? `https://www.youtube.com/channel/${channelId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
  fetch(nameUrl, { headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'en' } })
    .then((r) => r.text())
    .then((html) => {
      const m = html.match(/<title>([^<]+?)(?: - YouTube)?<\/title>/);
      if (m) setLabel('youtube', m[1].trim());
    })
    .catch(() => {});
  const { LiveChat } = require('youtube-chat');

  let retryTimer = null;
  const retry = (ms) => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, ms);
  };

  const connect = async () => {
    const chat = new LiveChat(videoId ? { liveId: videoId } : { channelId });
    chat.on('chat', (item) => {
      const text = item.message
        .map((m) => (m.text !== undefined ? m.text : (m.emojiText ? `:${m.emojiText}:` : '')))
        .join('');
      pushChat('youtube', item.author.name, text);
    });
    chat.on('error', (err) => console.error('[youtube]', err && err.message || err));
    chat.on('end', () => {
      chat.stop();
      setStatus('youtube', 'waiting for live');
      retry(60000);
    });
    setStatus('youtube', 'connecting');
    let ok = false;
    try { ok = await chat.start(); } catch (err) { console.error('[youtube]', err); }
    if (ok) {
      setStatus('youtube', 'connected');
    } else {
      chat.stop();
      setStatus('youtube', 'waiting for live');
      retry(60000);
    }
  };
  connect();
}

// ---------- TikTok (connects to the user's current live) ----------
function startTikTok() {
  const username = (config.tiktok && config.tiktok.username || '').trim();
  if (!username) return setStatus('tiktok', 'off');
  labels.tiktok = username;
  const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
  const conn = new TikTokLiveConnection(username, {});

  let retryTimer = null;
  const retry = (ms) => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; tryConnect(); }, ms);
  };

  conn.on(WebcastEvent.CHAT, (d) => {
    const u = d.user || {};
    pushChat('tiktok', u.nickname || u.uniqueId, d.content || d.comment);
  });
  conn.on(ControlEvent.DISCONNECTED, () => {
    setStatus('tiktok', 'waiting for live');
    retry(60000);
  });
  conn.on(ControlEvent.ERROR, (err) => console.error('[tiktok]', err && err.message || err));

  const tryConnect = () => {
    setStatus('tiktok', 'connecting');
    conn.connect()
      .then(() => setStatus('tiktok', 'connected'))
      .catch((err) => {
        console.error('[tiktok]', err && err.message || err);
        setStatus('tiktok', 'waiting for live');
        retry(60000);
      });
  };
  tryConnect();
}

// ---------- Facebook ----------
// Primary (deployable, fully server-side): Graph API with a Page access token.
// Paste pageId + accessToken once; the server auto-detects when the page goes
// live and attaches to that broadcast's comment stream. No browser, no
// extension, nothing running on a PC.
// Fallback: Social Stream Ninja relay (browser-extension capture).
function startFacebook() {
  const cfg = config.facebook || {};
  const liveUrl = (cfg.liveUrl || '').trim();
  if (liveUrl) return startFacebookBrowser(liveUrl);
  const accessToken = (cfg.accessToken || '').trim();
  const pageId = (cfg.pageId || '').trim();
  const liveVideoId = (cfg.liveVideoId || '').trim();
  const overrideUrl = process.env.FB_STREAM_URL; // test hook: point at a mock SSE stream
  if (overrideUrl || (accessToken && (pageId || liveVideoId))) {
    return startFacebookGraph({ accessToken, pageId, liveVideoId, overrideUrl });
  }
  const session = (cfg.socialStreamSession || '').trim();
  if (session) return startFacebookSocialStream(session);
  setStatus('facebook', 'off');
}

// No-API mode: a headless browser with a saved Facebook login watches the live
// page and relays chat as it appears in the DOM. One-time setup: node fblogin.js
// (opens a window, log in to Facebook, close it — the session is saved to
// fb-profile/ and reused headless from then on).
function startFacebookBrowser(liveUrl) {
  const { chromium } = require('playwright-core');
  const profileDir = path.join(__dirname, 'fb-profile');
  labels.facebook = liveUrl.replace(/^https?:\/\/(www\.)?facebook\.com\//, 'fb.com/').slice(0, 50);
  let lastMsgAt = 0;
  // Logged out, the page only renders a static preview of the newest comments,
  // so we reload on an interval and dedupe what we've already relayed.
  const seen = new Set();
  const seenOrder = [];
  const remember = (k) => {
    seen.add(k);
    seenOrder.push(k);
    if (seenOrder.length > 800) seen.delete(seenOrder.shift());
  };

  const run = async () => {
    setStatus('facebook', 'connecting');
    let ctx;
    let restarted = false;
    const timers = [];
    const retry = async (ms, state) => {
      if (restarted) return;
      restarted = true;
      timers.forEach(clearInterval);
      if (state) setStatus('facebook', state);
      try { if (ctx) await ctx.close(); } catch {}
      setTimeout(run, ms);
    };
    try {
      // Use whatever browser the host has: FB_BROWSER_CHANNEL to force one,
      // else Edge (Windows dev box) -> Chrome -> Playwright's own chromium.
      const launchOpts = { headless: true, viewport: { width: 1280, height: 900 } };
      const channels = process.env.FB_BROWSER_CHANNEL
        ? [process.env.FB_BROWSER_CHANNEL]
        : ['msedge', 'chrome', undefined];
      let lastErr;
      for (const channel of channels) {
        try {
          ctx = await chromium.launchPersistentContext(profileDir, { ...launchOpts, channel });
          break;
        } catch (err) { lastErr = err; }
      }
      if (!ctx) throw lastErr;
      const page = ctx.pages()[0] || await ctx.newPage();

      await page.exposeFunction('mcPush', (name, text) => {
        name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
        // Strip the trailing relative timestamp FB appends ("...text2m").
        text = text.replace(/\s*\d+[smhdw]$/, '');
        if (!text) return;
        const key = `${name}|${text}`;
        if (seen.has(key)) return;
        remember(key);
        lastMsgAt = Date.now();
        pushChat('facebook', name || 'Facebook user', text);
      });
      // Re-applied on every navigation: watch the DOM for new comment blocks.
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
              // Leaf nodes only — nested dir=auto wrappers repeat their child's
              // text and would duplicate every message.
              const texts = [...b.querySelectorAll('div[dir="auto"], span[dir="auto"]')]
                .filter((e) => !e.querySelector('div[dir="auto"], span[dir="auto"]'))
                .map((e) => e.textContent.trim()).filter(Boolean)
                .filter((t) => !/^\d+[smhdw]$/.test(t)) // relative timestamps ("2m")
                .filter((t, i, a) => t !== a[i - 1]);
              if (!texts.length) continue;
              const nameEl = b.querySelector('a strong, a span[dir="auto"], strong');
              const name = nameEl ? nameEl.textContent.trim() : texts[0];
              const msg = texts.filter((t) => t && t !== name).join(' ');
              if (msg && window.mcPush) window.mcPush(name, msg);
            }
          };
          new MutationObserver((muts) => {
            for (const m of muts) for (const n of m.addedNodes) extract(n);
          }).observe(document.body, { childList: true, subtree: true });
        };
        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start);
      });

      await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(8000);
      if (page.url().includes('/login')) return retry(300000, 'blocked (login redirect)');
      setStatus('facebook', lastMsgAt ? 'connected' : 'waiting for comments');

      // Poll: reload to refresh the comment preview; dedupe keeps only new ones.
      timers.push(setInterval(() => {
        page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      }, 45000));

      // Flip to connected when comments arrive; full restart if stale too long.
      const startedAt = Date.now();
      timers.push(setInterval(() => {
        const idle = Date.now() - Math.max(lastMsgAt, startedAt);
        if (lastMsgAt > startedAt && status.facebook !== 'connected') setStatus('facebook', 'connected');
        if (idle > 15 * 60 * 1000) retry(5000, 'reconnecting');
      }, 30000));

      page.on('close', () => retry(30000, 'reconnecting'));
      ctx.on('close', () => retry(30000, 'reconnecting'));
    } catch (err) {
      console.error('[facebook]', err && err.message || err);
      return retry(30000, 'reconnecting');
    }
  };
  run();
}

function startFacebookGraph({ accessToken, pageId, liveVideoId, overrideUrl }) {
  const G = 'https://graph.facebook.com/v19.0';
  labels.facebook = overrideUrl ? 'mock' : (pageId ? `page ${pageId}` : `video ${liveVideoId}`);
  if (pageId && accessToken) {
    fetch(`${G}/${pageId}?fields=name&access_token=${encodeURIComponent(accessToken)}`)
      .then((r) => r.json())
      .then((j) => { if (j.name) setLabel('facebook', j.name); })
      .catch(() => {});
  }

  // Find the page's currently-live broadcast (unless a video id is pinned).
  const findLive = async () => {
    if (overrideUrl) return 'mock';
    if (liveVideoId) return liveVideoId;
    const r = await fetch(`${G}/${pageId}/live_videos?fields=id,status&limit=10&access_token=${encodeURIComponent(accessToken)}`);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    const live = (j.data || []).find((v) => v.status === 'LIVE');
    return live ? live.id : null;
  };

  const connect = async () => {
    setStatus('facebook', 'connecting');
    let vid;
    try {
      vid = await findLive();
    } catch (err) {
      console.error('[facebook]', err.message);
      setStatus('facebook', 'error (check token)');
      return setTimeout(connect, 60000);
    }
    if (!vid) {
      setStatus('facebook', 'waiting for live');
      return setTimeout(connect, 60000);
    }
    const url = overrideUrl ||
      `https://streaming-graph.facebook.com/${vid}/live_comments` +
      `?access_token=${encodeURIComponent(accessToken)}` +
      `&comment_rate=one_per_two_seconds&fields=from{name},message`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('facebook', 'connected');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line.startsWith('data:')) {
            try {
              const d = JSON.parse(line.slice(5).trim());
              pushChat('facebook', d.from && d.from.name, d.message);
            } catch { /* keep-alive or partial line */ }
          }
        }
      }
      throw new Error('stream ended');
    } catch (err) {
      console.error('[facebook]', err && err.message || err);
      setStatus('facebook', 'reconnecting');
      setTimeout(connect, 30000);
    }
  };
  connect();
}

function startFacebookSocialStream(session) {
  const { WebSocket } = require('ws');
  labels.facebook = `Social Stream: ${session}`;
  let gotMessage = false;

  const connect = () => {
    setStatus('facebook', 'connecting');
    const ws = new WebSocket('wss://io.socialstream.ninja');
    ws.on('open', () => {
      ws.send(JSON.stringify({ join: session, in: 4, out: 5 }));
      setStatus('facebook', gotMessage ? 'connected' : 'waiting for extension');
    });
    ws.on('message', (data) => {
      let d;
      try { d = JSON.parse(data.toString()); } catch { return; }
      if (!d || d.type !== 'facebook') return;
      const text = String(d.chatmessage || '').replace(/<[^>]*>/g, '').trim();
      if (!text) return;
      if (!gotMessage) { gotMessage = true; setStatus('facebook', 'connected'); }
      pushChat('facebook', String(d.chatname || 'Facebook user').replace(/<[^>]*>/g, ''), text);
    });
    const reconnect = () => {
      setStatus('facebook', 'reconnecting');
      setTimeout(connect, 10000);
    };
    ws.on('close', reconnect);
    ws.on('error', (err) => {
      console.error('[facebook]', err && err.message || err);
      ws.terminate();
    });
    // The relay drops idle connections; keep it alive.
    const ping = setInterval(() => { if (ws.readyState === 1) ws.ping(); }, 30000);
    ws.on('close', () => clearInterval(ping));
  };
  connect();
}

server.listen(PORT, () => {
  console.log(`Multichat running at http://localhost:${PORT}`);
  startTwitch();
  startYouTube();
  startTikTok();
  startFacebook();
});

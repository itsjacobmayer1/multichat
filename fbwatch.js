// Print facebook messages relayed by the local server for N seconds (default 45).
const { WebSocket } = require('ws');
const secs = Number(process.argv[2] || 45);
const ws = new WebSocket('ws://localhost:3100');
let n = 0;
ws.on('message', (data) => {
  const d = JSON.parse(data.toString());
  if (d.type === 'status' && d.platform === 'facebook') {
    console.log(`[status] ${d.state} (${d.label})`);
  }
  if (d.type === 'chat' && d.platform === 'facebook') {
    n++;
    console.log(`[${n}] ${d.user}: ${d.text.slice(0, 120)}`);
  }
  if (d.type === 'init') {
    console.log(`[init] fb status: ${d.status.facebook}`);
    for (const m of d.recent.filter((m) => m.platform === 'facebook').slice(-5)) {
      console.log(`[recent] ${m.user}: ${m.text.slice(0, 120)}`);
    }
  }
});
setTimeout(() => { console.log(`total live fb msgs: ${n}`); process.exit(0); }, secs * 1000);

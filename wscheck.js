const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3100');
const counts = {};
ws.on('message', (data) => {
  const m = JSON.parse(data);
  const tally = (msg) => { counts[msg.platform] = (counts[msg.platform] || 0) + 1; };
  if (m.type === 'init') { console.log('status:', JSON.stringify(m.status)); m.recent.forEach(tally); }
  else if (m.type === 'chat') tally(m);
});
setTimeout(() => { console.log('per-platform counts:', JSON.stringify(counts)); process.exit(0); }, 25000);

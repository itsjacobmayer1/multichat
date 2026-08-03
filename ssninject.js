// Emulates the SSN extension publishing one Facebook chat message into the session,
// to verify the server's Facebook wiring end-to-end.
const WebSocket = require('ws');
const session = require('./config.json').facebook.socialStreamSession;
const ws = new WebSocket('wss://io.socialstream.ninja');
ws.on('open', async () => {
  ws.send(JSON.stringify({ join: session, in: 5, out: 4 }));
  await new Promise((r) => setTimeout(r, 1500));
  ws.send(JSON.stringify({ chatname: 'Wiring Test', chatmessage: 'Facebook pipeline verified — waiting for the SSN extension for real chat', type: 'facebook' }));
  console.log('injected into session', session);
  setTimeout(() => process.exit(0), 1000);
});
ws.on('error', (e) => { console.error(e.message); process.exit(1); });

// Local stand-in for streaming-graph.facebook.com/{id}/live_comments (SSE format).
const http = require('http');
const names = ['Test Viewer', 'Mock Fan', 'FB Tester'];
let n = 0;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const t = setInterval(() => {
    n++;
    res.write(`data: ${JSON.stringify({ from: { name: names[n % names.length] }, message: `mock facebook comment #${n}` })}\n\n`);
  }, 1000);
  req.on('close', () => clearInterval(t));
}).listen(3199, () => console.log('fb mock on :3199'));

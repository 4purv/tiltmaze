// No dependencies. Run: node serve-game.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const filename = 'TiltMaze 3D (1).html';
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  if (pathname !== '/' && pathname !== '/' + filename) { res.writeHead(404).end('Not found'); return; }
  fs.readFile(path.join(__dirname, filename), (err, data) => {
    if (err) { res.writeHead(500).end('Cannot read the game HTML.'); return; }
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.on('error', error => {
  console.error('Could not start TiltMaze:', error.message);
  process.exitCode = 1;
});
server.listen(8080, '127.0.0.1', () => console.log('Open http://localhost:8080 in Chrome. Press Ctrl+C to stop.'));

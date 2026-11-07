// The canary of widget-sandbox's attack corpus (its tests/canary-server.ts): every vector in
// src/lib/widgetSandbox/fixtures/attacks points at 127.0.0.1:9999 — on the popup suites' servers at the port this is
// given, the checkout's own (playwright.popups.config.ts) — so anything that arrives here is a leak: an HTTP request, a
// WebSocket, a bare TCP connection (a preconnect) or a UDP datagram (STUN). `GET /__hits` answers the log. Started by
// playwright.popups.config.ts for the whole run.

import dgram from 'node:dgram';
import http from 'node:http';
import type {Socket} from 'node:net';

const PORT = Number(process.argv[2]) || 9999;
const HOST = '127.0.0.1';

type Hit = {kind: 'http' | 'tcp' | 'ws' | 'udp', time: number, url?: string, detail?: string};

const hits: Hit[] = [];
const connections = new WeakMap<Socket, Hit>();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if(req.url === '/__hits') {
    // the runner's own question is no leak
    const own = connections.get(req.socket);
    if(own && hits.includes(own)) hits.splice(hits.indexOf(own), 1);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(hits));
    return;
  }

  hits.push({kind: 'http', time: Date.now(), url: req.url, detail: String(req.headers['sec-fetch-dest'] ?? '')});
  res.end('canary');
});

server.on('connection', (socket) => {
  const hit: Hit = {kind: 'tcp', time: Date.now(), detail: `${socket.remoteAddress}:${socket.remotePort}`};
  hits.push(hit);
  connections.set(socket, hit);
});
server.on('upgrade', (req, socket) => {
  hits.push({kind: 'ws', time: Date.now(), url: req.url});
  socket.destroy();
});
server.listen(PORT, HOST);

const udp = dgram.createSocket('udp4');
udp.on('message', (message, from) => hits.push({kind: 'udp', time: Date.now(), detail: `${from.address}:${from.port} ${message.length} bytes`}));
udp.bind(PORT, HOST);

const express = require('express');
const http = require('http');
const httpProxy = require('http-proxy');
const app = express();

const fromPort = 80;
const toPort = 8080;
const host = 'localhost';

app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('*', async(req, res) => {
  const promise = fetch(`http://${host}:${toPort}` + req.url);
  const fetchResponse = await promise;
  fetchResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  const clone = fetchResponse.clone();
  let text = await fetchResponse.text();
  if(text.includes(`${host}:${toPort}`)) {
    text = text.replace(`${host}:${toPort}`, `${host}:${fromPort}`);
    res.send(text);
  } else {
    const arrayBuffer = await clone.arrayBuffer();
    const array = new Uint8Array(arrayBuffer);
    res.write(array);
    res.end();
  }
});

const server = http.createServer(app).listen(fromPort);
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head);
});

const proxy = new httpProxy.createProxyServer({
  target: {
    host: host,
    port: toPort
  }
});

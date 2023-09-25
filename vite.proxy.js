const express = require('express');
const http = require('http');
const app = express();
app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('*', async(req, res) => {
  const promise = fetch('http://localhost:8080' + req.url);
  res.write(await promise.then((response) => {
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    return response.arrayBuffer();
  }).then((arrayBuffer) => new Uint8Array(arrayBuffer)));
  res.end();
});

http.createServer(app).listen(80);

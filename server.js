const compression = require('compression');
const express = require('express');
const https = require('https');
const fs = require('fs');

const app = express();

app.use(compression());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public3/index.html');
});

https.createServer({
  key: fs.readFileSync(__dirname + '/certs/server-key.pem'),
  cert: fs.readFileSync(__dirname + '/certs/server-cert.pem')
}, app).listen(443/* 9001 */, () => {
  console.log('Listening...');
});
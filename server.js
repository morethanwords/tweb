const compression = require('compression');
const express = require('express');
const https = require('https');
const fs = require('fs');

const app = express();

app.use(compression());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

https.createServer({
  key: fs.readFileSync(__dirname + '/tweb.key'),
  cert: fs.readFileSync(__dirname + '/tweb.crt')
}, app).listen(9001, () => {
  console.log('Listening...');
});
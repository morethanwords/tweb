const compression = require('compression');
const express = require('express');
const https = require('https');
const fs = require('fs');

const app = express();

const thirdTour = process.argv[2] == 3;

const publicFolderName = thirdTour ? 'public3' : 'public';
const port = thirdTour ? 8443 : 443;

app.use(compression());
app.use(express.static(publicFolderName));

app.get('/', (req, res) => {
  res.sendFile(__dirname + `/${publicFolderName}/index.html`);
});

https.createServer({
  key: fs.readFileSync(__dirname + '/certs/server-key.pem'),
  cert: fs.readFileSync(__dirname + '/certs/server-cert.pem')
}, app).listen(port, () => {
  console.log('Listening port:', port, 'folder:', publicFolderName);
});
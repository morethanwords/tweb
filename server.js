const compression = require('compression');
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');

const app = express();

const thirdTour = process.argv[2] == 3;
const forcePort = process.argv[3];
const useHttp = process.argv[4] === 'http';

const publicFolderName = thirdTour ? 'public3' : 'public';
const port = forcePort ? +forcePort : (thirdTour ? 8443 : 8443);

app.use(compression());
app.use(express.static(publicFolderName));

app.get('/', (req, res) => {
  res.sendFile(__dirname + `/${publicFolderName}/index.html`);
});

const server = useHttp ? http : https;

server.createServer({
  key: fs.readFileSync(__dirname + '/certs/server-key.pem'),
  cert: fs.readFileSync(__dirname + '/certs/server-cert.pem')
}, app).listen(port, () => {
  console.log('Listening port:', port, 'folder:', publicFolderName);
});
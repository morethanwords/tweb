const compression = require('compression');
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');

const app = express();

const thirdTour = process.argv[2] == 3;
const forcePort = process.argv[3];
const useHttp = process.argv[4] !== 'https';

const publicFolderName = thirdTour ? 'public3' : 'public';
const serveDist = process.argv.includes('--dist');
const indexFolderName = serveDist ? 'dist' : publicFolderName;
const port = forcePort ? +forcePort : (thirdTour ? 8443 : 80);

app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// * the 3D star's mesh is served as `model/mesh`, which compression's MIME list calls incompressible: it packs to 70%
app.use(compression({
  filter: (req, res) => /\.mesh(?:\?|$)/.test(req.url) || compression.filter(req, res)
}));
if(serveDist) {
  app.use(express.static('dist'));
}
app.use(express.static(publicFolderName));

app.get('/', (req, res) => {
  res.sendFile(__dirname + `/${indexFolderName}/index.html`);
});

const server = useHttp ? http : https;

const options = {};
if(!useHttp) {
  options.key = fs.readFileSync(__dirname + '/certs/server-key.pem');
  options.cert = fs.readFileSync(__dirname + '/certs/server-cert.pem');
}

server.createServer(options, app).listen(port, () => {
  console.log('Listening port:', port, 'folder:', indexFolderName);
});

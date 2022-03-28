// @ts-check

const https = require('https');
const http = require('http');
const fs = require('fs');

const gitstatic = require("./git-serve");
const express = require("express");

const repository = '.git';

const app = express();
app.get(/^\/.+/, gitstatic.route().repository(repository));
app.get(/\//, (req, res) => {
  gitstatic.listAllCommits(repository, (err, commits) => {
    console.log(err, commits);

    res.send(
      commits.map((commit) => {
        return `<a href="/${commit.sha}/public/index.html" target="_blank"><span style="font-family: monospace;">${commit.sha.slice(0, 7)} - ${commit.date.toISOString()}</span></a> - <a href="https://github.com/morethanwords/tweb/commit/${commit.sha}" target="_blank">${commit.subject}</a><br>`;
      }).join('')
    );
  });
});

const { networkInterfaces } = require('os');
const nets = networkInterfaces();
const results = {};

for(const name of Object.keys(nets)) {
  for(const net of nets[name]) {
    // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
    if(net.family === 'IPv4' && !net.internal) {
      if(!results[name]) {
        results[name] = [];
      }
      results[name].push(net.address);
    }
  }
}

const useHttp = false;
const transport = useHttp ? http : https;
let options = {};
if(!useHttp) {
  options.key = fs.readFileSync(__dirname + '/certs/server-key.pem');
  options.cert = fs.readFileSync(__dirname + '/certs/server-cert.pem');
}

console.log(results);

const port = 3000;
const protocol = useHttp ? 'http' : 'https';
console.log('Listening port:', port);
function createServer(host) {
  const server = transport.createServer(options, app);
  server.listen(port, host, () => {
    console.log('Host:', `${protocol}://${host || 'localhost'}:${port}/`);
  });

  server.on('error', (e) => {
    // @ts-ignore
    if(e.code === 'EADDRINUSE') {
      console.log('Address in use:', host);
      server.close();
    }
  });
}

for(const name in results) {
  const ips = results[name];
  for(const ip of ips) {
    createServer(ip);
  }
}

createServer();

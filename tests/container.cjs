/* Real Caddy HTTP/TLS/WebSocket tests. Docker daemon and openssl are required. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {once} = require('node:events');
const {WebSocket, WebSocketServer} = require('ws');
const routes = require('../deploy/generate-routes.cjs');

const image = process.env.TEST_IMAGE || 'telegram-web-k:local';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tweb-relay-'));
fs.chmodSync(tmp, 0o755);
const containers = [];
const networks = [];
const composeProjects = [];
const docker = (...args) => execFileSync('docker', args, {encoding: 'utf8', timeout: 120000}).trim();
const body = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
const authUser = 'relay-test';
const authPassword = crypto.randomBytes(24).toString('base64url');
const authorization = 'Basic ' + Buffer.from(`${authUser}:${authPassword}`).toString('base64');
let authEnvironment;
const request = (url, options = {}) => fetch(url, {
  ...options, headers: {Authorization: authorization, ...options.headers}
});
const credentials = {
  Cookie: 'private=session', Authorization: authorization, 'Proxy-Authorization': 'Basic private',
  'X-Forwarded-For': '192.0.2.10', 'X-Real-IP': '192.0.2.11', Forwarded: 'for=192.0.2.12',
  'CF-Connecting-IP': '192.0.2.13', 'X-Auth-Token': 'private', Origin: 'https://private.example',
  Referer: 'https://private.example/secret', 'User-Agent': 'private browser'
};
const requests = [];
let server;
let wss;

async function waitReady(base) {
  for(let i = 0; i < 100; i++) {
    try { if((await fetch(`${base}/healthz`, {signal: AbortSignal.timeout(2000)})).status === 200) return; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Container not ready: ${base}`);
}

async function start(extra = []) {
  const id = docker('run', '-d', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m,uid=10001,gid=10001,mode=1700', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '-p', '127.0.0.1::8080', ...authEnvironment, ...extra, image);
  containers.push(id);
  const port = JSON.parse(docker('inspect', id))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort;
  const base = `http://127.0.0.1:${port}`;
  await waitReady(base);
  return {id, base};
}

function assertPrivate(req, route) {
  assert.equal(req.headers.host, route.host);
  assert.equal(req.socket.servername, route.host, 'TLS SNI must select the actual Telegram host');
  assert.equal(req.url, route.endpoint);
  for(const name of Object.keys(credentials)) {
    if(name === 'User-Agent') assert.notEqual(req.headers['user-agent'], credentials[name]);
    else assert.equal(req.headers[name.toLowerCase()], undefined, `Leaked ${name}`);
  }
  for(const name of ['x-forwarded-proto', 'x-forwarded-host']) assert.equal(req.headers[name], undefined, `Leaked ${name}`);
}

async function socketRoundtrip(base, route, options = {}) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + route.path, 'binary', {headers: credentials, handshakeTimeout: 5000, ...options});
  try {
    await once(ws, 'open');
    assert.equal(ws.protocol, 'binary');
    const message = once(ws, 'message');
    ws.send(body);
    const [received, binary] = await message;
    assert.equal(binary, true);
    assert.deepEqual(received, body);
  } finally {
    const closed = once(ws, 'close');
    ws.close();
    await closed;
  }
}

async function rejectedSocket(base, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + '/mtproto/kws2/apiws', 'binary', {headers, handshakeTimeout: 5000});
    ws.on('error', reject);
    ws.on('open', () => { ws.terminate(); reject(new Error('Unauthenticated WebSocket accepted')); });
    ws.on('unexpected-response', (req, res) => {
      resolve(res.statusCode);
      req.destroy();
      res.destroy();
    });
  });
}

(async() => {
  // Test-only random credential. Production uses the default, stronger bcrypt cost.
  const hash = docker('run', '--rm', image, 'hash-password', '--plaintext', authPassword, '--bcrypt-cost', '4');
  authEnvironment = ['-e', `BASIC_AUTH_USER=${authUser}`, '-e', `BASIC_AUTH_PASSWORD_HASH=${hash}`];
  // Exercise Compose's .env parser, not its serialized config (which escapes $ as $$).
  const composeFile = path.join(tmp, 'compose-image.json');
  const envFile = path.join(tmp, 'compose.env');
  fs.writeFileSync(composeFile, JSON.stringify({services: {web: {image}}}));
  fs.writeFileSync(envFile, `BASIC_AUTH_USER=${authUser}\nBASIC_AUTH_PASSWORD_HASH='${hash}'\n`);
  const composeEnv = {...process.env};
  delete composeEnv.BASIC_AUTH_USER;
  delete composeEnv.BASIC_AUTH_PASSWORD_HASH;
  const composeArgs = ['compose', '-p', `tweb-auth-${crypto.randomBytes(6).toString('hex')}`,
    '--env-file', envFile, '-f', path.resolve('deploy/compose.yaml'), '-f', composeFile];
  const compose = (...args) => execFileSync('docker', [...composeArgs, ...args], {
    env: composeEnv, encoding: 'utf8', timeout: 120000, stdio: 'pipe'
  });
  composeProjects.push(compose);
  const environment = compose('run', '--rm', '--no-deps', 'web', 'environ').split('\n');
  assert(environment.includes(`BASIC_AUTH_USER=${authUser}`));
  assert(environment.includes(`BASIC_AUTH_PASSWORD_HASH=${hash}`), 'Compose must preserve the exact bcrypt hash');
  fs.writeFileSync(envFile, 'BASIC_AUTH_USER=\nBASIC_AUTH_PASSWORD_HASH=\n');
  assert.throws(() => compose('config', '--quiet'), 'Compose must reject missing credentials');
  fs.writeFileSync(envFile, `BASIC_AUTH_USER=${authUser}\nBASIC_AUTH_PASSWORD_HASH='${hash}'\n`);
  console.log('PASS Compose runtime credentials preserve bcrypt dollar signs and require configuration');
  assert.throws(() => docker('run', '--rm', '-e', 'BASIC_AUTH_USER=', '-e', 'BASIC_AUTH_PASSWORD_HASH=',
    image, 'validate', '--config', '/etc/caddy/Caddyfile'), 'Missing credentials must fail closed');
  const prod = await start();
  for(const pathname of ['/', '/index.html', '/sw.js', '/build-info.json', '/some/nested/chat', '/mtproto/unknown']) {
    const response = await fetch(prod.base + pathname, {headers: {Accept: 'text/html'}});
    assert.equal(response.status, 401, pathname);
    assert.match(response.headers.get('www-authenticate'), /^Basic realm="Telegram Web K"$/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(prod.base + '/', {headers: {Authorization: 'Basic ' + Buffer.from(`${authUser}:wrong`).toString('base64')}})).status, 401);
  assert.equal((await fetch(prod.base + '/healthz')).status, 200);
  assert.equal((await fetch(prod.base + '/healthz', {method: 'HEAD'})).status, 200);
  const state = JSON.parse(docker('inspect', prod.id))[0];
  assert.equal(state.Config.User, '10001:10001');
  assert.equal(state.HostConfig.ReadonlyRootfs, true);
  const index = await request(prod.base + '/');
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /Telegram/);
  assert.equal(index.headers.get('cache-control'), 'private, no-cache');
  const info = await (await request(prod.base + '/build-info.json')).json();
  assert.equal(info.relayPath, '/mtproto');
  if(process.env.EXPECTED_REVISION) assert.equal(info.revision, process.env.EXPECTED_REVISION);
  const assets = [...html.matchAll(/(?:src|href)="(\/?[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/g)].map(m => m[1]);
  assert(assets.some(a => a.endsWith('.js')) && assets.some(a => a.endsWith('.css')));
  assert.equal((await fetch(new URL(assets[0], prod.base))).status, 401, 'Static assets must be protected too');
  for(const name of Object.keys(info.hashes)) {
    const response = await request(prod.base + '/' + name);
    assert.equal(response.status, 200, name);
    const data = Buffer.from(await response.arrayBuffer());
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), info.hashes[name], name);
    if(name.endsWith('.js')) assert.match(response.headers.get('content-type'), /javascript/);
    if(name.endsWith('.css')) assert.match(response.headers.get('content-type'), /text\/css/);
    if(name.startsWith('mtproto.worker.')) assert(data.includes('/mtproto'), 'Worker must contain compiled relay');
    if(name.includes('.bundle.js')) assert.match(response.headers.get('cache-control'), /^private,.*immutable/);
  }
  for(const asset of assets) assert.equal((await request(new URL(asset, prod.base))).status, 200, asset);
  const spa = await request(prod.base + '/some/nested/chat', {headers: {Accept: 'text/html'}});
  assert.equal(await spa.text(), html);
  for(const url of ['/mtproto', '/mtproto/unknown', '/missing.js']) {
    assert.equal((await request(prod.base + url, {headers: {Accept: 'text/html'}})).status, 404, url);
  }
  const sw = await request(prod.base + '/sw.js');
  assert.equal(sw.headers.get('cache-control'), 'private, no-cache');
  assert.equal(sw.headers.get('service-worker-allowed'), '/');
  const compressed = await request(prod.base + assets[0], {headers: {'Accept-Encoding': 'br'}});
  assert.equal(compressed.headers.get('content-encoding'), 'br');
  docker('restart', prod.id);
  prod.base = `http://127.0.0.1:${JSON.parse(docker('inspect', prod.id))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort}`;
  await waitReady(prod.base);
  console.log('PASS production static assets, build hashes, cache, SPA, read-only non-root runtime, restart');

  // Test-only TLS trust root. Production configuration still verifies public TLS.
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=relay-test', '-addext', 'subjectAltName=DNS:*.web.telegram.org,DNS:telegram.test',
    '-keyout', path.join(tmp, 'key.pem'), '-out', path.join(tmp, 'cert.pem')], {stdio: 'ignore'});
  server = https.createServer({key: fs.readFileSync(path.join(tmp, 'key.pem')), cert: fs.readFileSync(path.join(tmp, 'cert.pem'))}, async(req, res) => {
    requests.push(req);
    const chunks = [];
    for await(const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if(bytes.toString() === 'redirect') {
      res.writeHead(302, {Location: 'https://venus.web.telegram.org/apiw1'});
      res.end();
    } else {
      res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Set-Cookie': 'upstream=secret'});
      res.end(bytes);
    }
  });
  wss = new WebSocketServer({server});
  wss.on('connection', (ws, req) => {
    requests.push(req);
    ws.on('message', (data, binary) => ws.send(data, {binary}));
  });
  server.listen(0, '0.0.0.0');
  await once(server, 'listening');
  const port = server.address().port;
  let config = fs.readFileSync('deploy/Caddyfile', 'utf8');
  config = config.replace('reverse_proxy https://{args[1]}', `reverse_proxy https://host.docker.internal:${port}`)
    .replace('tls_server_name {args[1]}', 'tls_server_name {args[1]}\n\t\t\t\ttls_trust_pool file /test/cert.pem');
  fs.writeFileSync(path.join(tmp, 'Caddyfile'), config);
  const mock = await start(['--add-host=host.docker.internal:host-gateway', '-v', `${tmp}:/test:ro`,
    '-v', `${path.join(tmp, 'Caddyfile')}:/etc/caddy/Caddyfile:ro`]);
  assert.equal((await fetch(mock.base + '/mtproto/venus/apiw1', {method: 'POST', body})).status, 401);
  assert.equal(await rejectedSocket(mock.base), 401);
  assert.equal(await rejectedSocket(mock.base, {Authorization: 'Bearer invalid'}), 401);
  assert.equal(requests.length, 0, 'Unauthenticated requests must not reach Telegram');
  for(const route of routes) {
    const before = requests.length;
    if(route.method === 'GET') await socketRoundtrip(mock.base, route);
    else {
      const result = await request(mock.base + route.path, {method: 'POST', headers: credentials, body});
      assert.equal(result.status, 200);
      assert.equal(result.headers.get('set-cookie'), null);
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), body);
    }
    assert.equal(requests.length, before + 1);
    assertPrivate(requests[before], route);
  }
  await Promise.all([socketRoundtrip(mock.base, routes[0]), socketRoundtrip(mock.base, routes[4])]);
  const before = requests.length;
  for(const url of [
    '/mtproto/kws6/apiws', '/mtproto/kws1/apiws?url=http://127.0.0.1',
    '/mtproto/127.0.0.1/apiws', '/mtproto/kws1.web.telegram.org.evil/apiws',
    '/mtproto/kws1/apiws/extra', '/mtproto/kws1/%61piws', '/mtproto/kws5/apiws_test',
    '/mtproto/venus/apiw1', '/mtproto/https://example.org/apiws'
  ]) assert.equal((await request(mock.base + url, {headers: {Accept: 'text/html'}})).status, 404, url);
  assert.equal((await request(mock.base + routes[0].path, {method: 'POST', body})).status, 404);
  assert.equal(requests.length, before, 'Invalid routes must never reach upstream');
  const redirected = await request(mock.base + '/mtproto/venus/apiw1', {method: 'POST', body: 'redirect', redirect: 'manual'});
  assert.equal(redirected.status, 502);
  assert.equal(redirected.headers.get('location'), null);
  console.log(`PASS Basic Auth, anonymous healthcheck, ${routes.length} authenticated routes, TLS/SNI/Host, binary POST/WS, credential stripping, concurrency, SSRF/redirect rejection`);

  // Real HAProxy terminates external TLS and forwards HTTP/Upgrade to Caddy.
  const network = `tweb-test-${crypto.randomBytes(6).toString('hex')}`;
  docker('network', 'create', network);
  networks.push(network);
  docker('network', 'connect', '--alias', 'web', network, mock.id);
  fs.writeFileSync(path.join(tmp, 'edge.pem'), fs.readFileSync(path.join(tmp, 'cert.pem')) + fs.readFileSync(path.join(tmp, 'key.pem')).toString());
  const example = fs.readFileSync('deploy/haproxy.example.cfg', 'utf8');
  const backend = example.slice(example.indexOf('\nbackend telegram_web')).replace('127.0.0.1:8080', 'web:8080');
  fs.writeFileSync(path.join(tmp, 'haproxy.cfg'), `
global
    maxconn 128
defaults
    mode http
    timeout connect 10s
    timeout client 75s
    timeout server 75s
frontend https_test
    bind :8443 ssl crt /test/edge.pem
    acl telegram_web_host hdr(host) -i telegram.test
    http-request set-header X-Forwarded-Proto https if telegram_web_host
    use_backend telegram_web if telegram_web_host
${backend}`);
  const edge = docker('run', '-d', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges:true',
    '--network', network, '-p', '127.0.0.1::8443', '-v', `${tmp}:/test:ro`,
    'haproxy:3.2-alpine@sha256:1c3568e520453cc8ba98c39501febcf450429c80e6cc27ecad779961d76e597c',
    'haproxy', '-W', '-db', '-f', '/test/haproxy.cfg');
  containers.push(edge);
  const edgePort = JSON.parse(docker('inspect', edge))[0].NetworkSettings.Ports['8443/tcp'][0].HostPort;
  const tls = {ca: fs.readFileSync(path.join(tmp, 'cert.pem')), servername: 'telegram.test'};
  const postThroughEdge = () => new Promise((resolve, reject) => {
    const req = https.request(`https://127.0.0.1:${edgePort}/mtproto/venus/apiw1`, {
      ...tls, method: 'POST', headers: {...credentials, Host: 'telegram.test'}, timeout: 3000
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, body: Buffer.concat(chunks)}));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('HAProxy timeout')));
    req.end(body);
  });
  let edgeResponse;
  for(let i = 0; i < 30; i++) {
    try { edgeResponse = await postThroughEdge(); if(edgeResponse.status === 200) break; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(edgeResponse?.status, 200);
  assert.deepEqual(edgeResponse.body, body);
  await socketRoundtrip(`https://127.0.0.1:${edgePort}`, routes[0], {...tls, headers: {...credentials, Host: 'telegram.test'}});
  assertPrivate(requests[requests.length - 1], routes[0]);
  console.log('PASS HAProxy HTTPS POST and WSS binary Upgrade through domain ACL to HTTP Caddy');

  // Same config with no custom CA must reject the mock certificate.
  fs.writeFileSync(path.join(tmp, 'untrusted.caddy'), config.replace(/\s*tls_trust_pool file \/test\/cert.pem/, ''));
  const untrusted = await start(['--add-host=host.docker.internal:host-gateway',
    '-v', `${path.join(tmp, 'untrusted.caddy')}:/etc/caddy/Caddyfile:ro`]);
  assert.equal((await request(untrusted.base + '/mtproto/venus/apiw1', {method: 'POST', body})).status, 502);
  // Broken static filesystem must be unhealthy, independently of Telegram.
  fs.mkdirSync(path.join(tmp, 'empty'));
  const bad = docker('run', '-d', '--read-only', ...authEnvironment, '-p', '127.0.0.1::8080', '-v', `${path.join(tmp, 'empty')}:/srv:ro`, image);
  containers.push(bad);
  const badPort = JSON.parse(docker('inspect', bad))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort;
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal((await request(`http://127.0.0.1:${badPort}/healthz`)).status, 503);
  console.log('PASS certificate rejection and missing-static healthcheck');
})().catch(error => {
  console.error(error);
  for(const id of containers) console.error(docker('logs', '--tail', '15', id));
  process.exitCode = 1;
}).finally(async() => {
  for(const id of containers) docker('rm', '-f', id);
  for(const network of networks) docker('network', 'rm', network);
  for(const compose of composeProjects) compose('down', '--remove-orphans');
  if(wss) { for(const ws of wss.clients) ws.terminate(); wss.close(); }
  if(server) { server.closeAllConnections(); server.close(); }
  fs.rmSync(tmp, {recursive: true, force: true});
});

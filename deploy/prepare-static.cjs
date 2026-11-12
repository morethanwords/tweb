// Only webpack's freshly emitted assets plus the required prebuilt runtime assets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const source = path.resolve('public');
const target = path.resolve('dist');
fs.rmSync(target, {recursive: true, force: true});
fs.mkdirSync(target);
const retained = /^(assets|changelogs|browserconfig\.xml|site\.webmanifest|version|(?:decoderWorker|encoderWorker|waveWorker|recorder)\.min\.(?:js|wasm)|rlottie-wasm\.(?:js|wasm))$/;
const emitted = new Set(JSON.parse(fs.readFileSync(path.join(source, 'build-assets.json'), 'utf8')));
for(const name of fs.readdirSync(source)) {
  // Some legacy rlottie bundles are intentionally kept by upstream's cleanup hook.
  // Use the actual compiler manifest, never a glob over old and new bundles.
  if(retained.test(name) || (emitted.has(name) && !name.endsWith('.map'))) {
    fs.cpSync(path.join(source, name), path.join(target, name), {recursive: true});
  }
}
const html = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
if(!html.includes('.bundle.js')) throw new Error('Missing compiled index');
const workers = fs.readdirSync(target).filter(n => n.startsWith('mtproto.worker.') && n.endsWith('.js'));
if(workers.length !== 1) throw new Error('Expected exactly one freshly built MTProto worker');
const worker = fs.readFileSync(path.join(target, workers[0]), 'utf8');
if(!worker.includes('/mtproto')) throw new Error('MTProto relay is missing from the built worker');
const hashes = {};
for(const name of fs.readdirSync(target)) {
  if(!/\.(?:js|css|html)$/.test(name)) continue;
  const data = fs.readFileSync(path.join(target, name));
  hashes[name] = crypto.createHash('sha256').update(data).digest('hex');
  fs.writeFileSync(path.join(target, name + '.gz'), zlib.gzipSync(data));
  fs.writeFileSync(path.join(target, name + '.br'), zlib.brotliCompressSync(data));
}
fs.writeFileSync(path.join(target, 'build-info.json'), JSON.stringify({revision: process.env.SOURCE_REVISION || 'local', relayPath: '/mtproto', hashes}, null, 2));
fs.copyFileSync('LICENSE', path.join(target, 'LICENSE'));
fs.copyFileSync('README.md', path.join(target, 'UPSTREAM-README.md'));
fs.copyFileSync('deploy/NOTICE', path.join(target, 'NOTICE'));

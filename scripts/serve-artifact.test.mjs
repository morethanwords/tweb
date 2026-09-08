import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {spawnSync} from 'node:child_process';
import {artifactServer, requestPath, CSP} from './serve-artifact.mjs';
import {allowedModule, validateAssetReferences, validateJavaScript} from './check-artifact.mjs';

test('paths reject traversal, encoded separators and absolute URLs without fallback', () => {
  for (const path of ['/../secret', '/%2e%2e/secret', '/a/./b', '/%2fsecret', '/%5csecret', '/a\\b', '/%00', '/%', '//evil/x', 'https://evil/x']) assert.equal(requestPath(path), null, path);
  assert.equal(requestPath('/?theme=night'), '/index.html');
  assert.equal(requestPath('/assets/app.js'), '/assets/app.js');
});
test('module allowlist forbids upstream bootstrap, registry Solid, server runtime and networking', () => {
  for (const id of ['src/index.ts', 'src/lib/appManagers/index.ts', 'node_modules/solid-js/dist/solid.js', 'src/vendor/solid/dist/server.js', 'src/helpers/request.ts', '\0vite/modulepreload-polyfill.js']) assert.equal(allowedModule(id), false, id);
  assert.equal(allowedModule('src/shell/App.tsx'), true);
  assert.equal(allowedModule('src/vendor/solid/web/dist/web.js'), true);
});
test('artifact server only serves immutable listed files and GET/HEAD with strict CSP', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shell-server-'));
  await mkdir(join(dir, 'dist'));
  const body = '<!doctype html><title>Fixture</title>';
  const sha256 = createHash('sha256').update(body).digest('hex');
  await writeFile(join(dir, 'dist/index.html'), body);
  await writeFile(join(dir, 'dist/unlisted.html'), 'forbidden');
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({schemaVersion: 1, files: [{path: '/index.html', bytes: Buffer.byteLength(body), sha256}]}));
  const server = await artifactServer({directory: join(dir, 'dist'), manifestPath: join(dir, 'manifest.json')});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const send = (path, method = 'GET') => new Promise((resolve, reject) => {
    const request = httpRequest({host: '127.0.0.1', port, path, method}, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString()}));
    });
    request.on('error', reject); request.end();
  });
  try {
    const page = await send('/');
    assert.equal(page.status, 200); assert.equal(page.body, body);
    assert.equal(page.headers['content-security-policy'], CSP);
    assert.equal((await send('/', 'HEAD')).body, '');
    assert.equal((await send('/', 'POST')).status, 405);
    assert.equal((await send('/unlisted.html')).status, 404);
    assert.equal((await send('/unknown/route')).status, 404);
    assert.equal((await send('/%2e%2e/manifest.json')).status, 404);
    const collision = spawnSync(process.execPath, ['scripts/serve-artifact.mjs', '--port', String(port), '--dir', join(dir, 'dist'), '--manifest', join(dir, 'manifest.json')], {encoding: 'utf8'});
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /EADDRINUSE/);
    await writeFile(join(dir, 'dist/index.html'), 'mutated after load');
    assert.equal((await send('/')).body, body);
    await assert.rejects(() => artifactServer({directory: join(dir, 'dist'), manifestPath: join(dir, 'manifest.json')}), /differs/);
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, {recursive: true}); }
});
test('unused external CSS and unlisted HTML references fail static verification', () => {
  const paths = new Set(['/assets/font.woff2', '/assets/main.js']);
  validateAssetReferences('/assets/main.css', '.unused{src:url("./font.woff2")}', paths);
  validateAssetReferences('/index.html', '<script type="module" src="/assets/main.js"></script>', paths);
  for (const css of ['.unused{background:url(https://example.invalid/a.svg)}', '@import "https://example.invalid/a.css";', '.unused{src:url(data:abc)}', '.unused{src:url(./missing.woff2)}']) assert.throws(() => validateAssetReferences('/assets/main.css', css, paths), /asset/);
  assert.throws(() => validateAssetReferences('/index.html', '<script src="/not-built.js"></script>', paths), /asset/);
  assert.throws(() => validateAssetReferences('/index.html', '<script>sideEffect()</script>', paths), /Inline/);
});

test('executable imports and worker URLs stay within exact artifact even in lazy code', () => {
  const paths = new Set(['/assets/app.js', '/assets/lazy.js', '/assets/worker.js']);
  validateJavaScript('/assets/app.js', 'import("./lazy.js"); const documentation="import(dynamicExpression)";', paths, [], false);
  validateJavaScript('/assets/lazy.js', 'new Worker(new URL("/assets/worker.js",import.meta.url),{type:"module"})', paths, ['/assets/worker.js'], true);
  for(const source of ['import(variable)', 'import("https://external.invalid/a.js")', 'import("/missing.js")', 'new Worker(new URL("./app.js",import.meta.url))']) {
    assert.throws(() => validateJavaScript('/assets/lazy.js', source, paths, ['/assets/worker.js'], true), /module source|Unlisted|Unauthorized/);
  }
  assert.throws(() => validateJavaScript('/assets/app.js', 'new Worker(new URL("./worker.js",import.meta.url))', paths, ['/assets/worker.js'], false), /Unauthorized/);
  for(const source of ['import {value} from "./worker.js"', 'import("./worker.js")', 'export {value} from "./worker.js"']) {
    assert.throws(() => validateJavaScript('/assets/lazy.js', source, paths, ['/assets/worker.js'], false), /Worker entry imported/);
  }
});

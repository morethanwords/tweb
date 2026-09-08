import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readdir, readFile, writeFile, lstat, mkdir} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const BUDGETS = Object.freeze({javascript: 250 * 1024, css: 100 * 1024, total: 700 * 1024});
const allowedVendor = new Set(['src/vendor/solid/dist/solid.js', 'src/vendor/solid/web/dist/web.js', 'src/vendor/solid/store/dist/store.js']);
export function allowedModule(id) {
  const clean = id.split('?')[0];
  return clean === 'index.html' || clean.startsWith('src/shell/') || allowedVendor.has(clean)
    || clean === '\0rolldown/runtime.js';
}
export function validateAssetReferences(path, body, paths) {
  const references = [];
  if (path.endsWith('.css')) {
    for (const match of body.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) references.push(match[1] ?? match[2] ?? match[3]);
    for (const match of body.matchAll(/@import\s+["']([^"']+)["']/gi)) references.push(match[1]);
  }
  if (path.endsWith('.html')) {
    for (const match of body.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(body) || /\son[a-z]+\s*=/i.test(body)) throw new Error('Inline executable HTML in ' + path);
  }
  for (const reference of references) {
    const value = reference.trim();
    if (value.startsWith('#')) continue;
    if (!value || value.includes('\\')) throw new Error('Unresolved asset reference in ' + path);
    const url = new URL(value, 'https://artifact.invalid' + path);
    if (url.origin !== 'https://artifact.invalid' || !paths.has(url.pathname)) throw new Error('Unlisted asset reference in ' + path + ': ' + value);
  }
}
export async function createManifest(directory, manifestPath, {checkModules = true} = {}) {
  const base = resolve(directory);
  const files = [];
  const textAssets = [];
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const file = join(dir, name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error('Symlinks are forbidden in artifacts.');
      if (info.isDirectory()) { await walk(file); continue; }
      const key = relative(base, file).split('\\').join('/');
      if (!/^(?:index\.html|(?:assets\/)?[A-Za-z0-9_./-]+\.(?:html|js|css|woff2|svg))$/.test(key) || key.endsWith('.map')) throw new Error('Unexpected artifact: ' + key);
      const bytes = await readFile(file);
      const body = bytes.toString('utf8');
      if (/\.(?:js|html)$/.test(key) && /(?:api\.telegram\.org|web\.telegram\.org|telegram\.org\/|indexedDB|localStorage|sessionStorage|serviceWorker|RTCPeerConnection|XMLHttpRequest|\bfetch\s*\(|new\s+(?:SharedWorker|Worker|WebSocket|EventSource)|sendBeacon|document\.cookie|navigator\.(?:mediaDevices|storage|geolocation))/.test(body)) throw new Error('Forbidden browser capability in ' + key);
      if (key.endsWith('.css') && /url\(\s*['"]?(?:https?:|data:|blob:|\/\/)/i.test(body)) throw new Error('Non-local CSS asset in ' + key);
      if (key.endsWith('.js') && /\bimport\s*\(/.test(body)) throw new Error('Dynamic import in ' + key);
      if (/\.(?:css|html)$/.test(key)) textAssets.push({path: '/' + key, body});
      files.push({path: '/' + key, bytes: bytes.length, gzip: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex')});
    }
  }
  await walk(base);
  if (!files.some(file => file.path === '/index.html')) throw new Error('Missing index.html.');
  const paths = new Set(files.map(file => file.path));
  for (const asset of textAssets) validateAssetReferences(asset.path, asset.body, paths);
  let modules = [];
  if (checkModules) {
    modules = JSON.parse(await readFile('artifacts/modules.json', 'utf8'));
    const unexpected = modules.filter(id => !allowedModule(id));
    if (unexpected.length) throw new Error('Non-shell runtime modules: ' + unexpected.join(', '));
    for (const file of ['src/vendor/solid/dist/solid.js', 'src/vendor/solid/web/dist/web.js']) if (modules.filter(id => id === file).length !== 1) throw new Error('Expected exactly one vendored browser runtime: ' + file);
  }
  const gzip = {
    javascript: files.filter(file => file.path.endsWith('.js')).reduce((sum, file) => sum + file.gzip, 0),
    css: files.filter(file => file.path.endsWith('.css')).reduce((sum, file) => sum + file.gzip, 0),
    total: files.reduce((sum, file) => sum + file.gzip, 0)
  };
  if (checkModules) for (const [name, limit] of Object.entries(BUDGETS)) if (gzip[name] > limit) throw new Error(name + ' gzip budget exceeded: ' + gzip[name] + ' > ' + limit);
  const manifest = {schemaVersion: 1, files, modules, gzip, budgets: BUDGETS};
  await mkdir(resolve(manifestPath, '..'), {recursive: true});
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await createManifest('dist', 'artifacts/build-manifest.json');
  console.log('Artifact verified:', manifest.files.length, 'files;', JSON.stringify(manifest.gzip), 'gzip bytes.');
}

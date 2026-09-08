import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, lstat, realpath} from 'node:fs/promises';
import {resolve, join, extname, relative} from 'node:path';
import {pathToFileURL} from 'node:url';

export const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'none'; worker-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; manifest-src 'none'";
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'};
export function requestPath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const pathname = raw.split('?')[0];
  if (/%(?:2f|5c|00)/i.test(pathname) || pathname.includes('\\')) return null;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  return decoded === '/' ? '/index.html' : decoded;
}
export async function artifactServer({directory = 'dist', manifestPath = 'artifacts/build-manifest.json'} = {}) {
  const base = await realpath(resolve(directory));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Invalid artifact manifest.');
  const contents = new Map();
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || requestPath(entry.path) !== entry.path || !TYPES[extname(entry.path)] || contents.has(entry.path)) throw new Error('Invalid manifest path.');
    const file = join(base, entry.path.slice(1));
    const canonical = await realpath(file);
    if (relative(base, canonical).startsWith('..') || (await lstat(file)).isSymbolicLink()) throw new Error('Artifact escaped directory.');
    const body = await readFile(canonical);
    if (body.length !== entry.bytes || createHash('sha256').update(body).digest('hex') !== entry.sha256) throw new Error('Artifact differs from manifest: ' + entry.path);
    contents.set(entry.path, body);
  }
  const workers = manifest.workers ?? [];
  const workerFiles = new Set(manifest.workerFiles ?? []);
  for(const file of [...workers, ...workerFiles]) if(!contents.has(file) || !file.endsWith('.js')) throw new Error('Worker is outside the verified artifact.');
  const appCsp = workers.length ? CSP.replace("worker-src 'none'", 'worker-src ' + workers.map(file => 'http://127.0.0.1:*' + file).join(' ')) : CSP;
  const workerCsp = CSP.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'");
  return createServer((request, response) => {
    response.setHeader('Content-Security-Policy', workerFiles.has(requestPath(request.url)) ? workerCsp : appCsp);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), display-capture=(), usb=(), payment=()');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, {Allow: 'GET, HEAD'}); response.end(); return; }
    const pathname = requestPath(request.url);
    const body = pathname && contents.get(pathname);
    if (!body) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', TYPES[extname(pathname)]);
    response.setHeader('Content-Length', body.length);
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const permitted = new Set(['--port', '--host', '--dir', '--manifest']);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!permitted.has(args[index]) || !args[index + 1]) throw new Error('Unknown or missing server argument.');
    options[args[index]] = args[index + 1];
  }
  const port = Number(options['--port'] ?? 3120);
  const host = options['--host'] ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !['127.0.0.1', '0.0.0.0', '::1'].includes(host)) throw new Error('Invalid listen address.');
  const server = await artifactServer({directory: options['--dir'], manifestPath: options['--manifest']});
  server.on('error', error => { console.error(error.message); process.exit(1); });
  server.listen(port, host, () => console.log('Artifact server http://' + host + ':' + port));
}

import {createHash} from 'node:crypto';
import {readFile, lstat, realpath} from 'node:fs/promises';
import {extname, join, relative, resolve, isAbsolute} from 'node:path';
import {CompanionLimits} from './contracts';

const mimeTypes: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm'
});

export function artifactPath(raw: string): string | null {
  if(!raw.startsWith('/') || raw.startsWith('//')) return null;
  const pathname = raw.split('?')[0];
  if(/%(?:2f|5c|00)/i.test(pathname) || pathname.includes('\\')) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if(decoded.includes('\0') || decoded.split('/').some(part => part === '.' || part === '..')) return null;
  return decoded === '/' ? '/index.html' : decoded;
}

export interface VerifiedArtifact {
  hash: string;
  contents: ReadonlyMap<string, {body: Buffer; type: string}>;
  workers: readonly string[];
  workerFiles: ReadonlySet<string>;
}

/** Load once; a running server never observes rebuilds beneath its directory. */
export async function loadArtifact(root: string, manifestPath = join(root, 'build-manifest.json')): Promise<VerifiedArtifact> {
  const base = await realpath(resolve(root));
  const manifestBytes = await readFile(manifestPath);
  if(manifestBytes.length > 1024 * 1024) throw new Error('Artifact manifest exceeds its limit.');
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
    schemaVersion: number; files: {path: string; bytes: number; sha256: string}[];
    workers?: string[]; workerFiles?: string[];
  };
  if(manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 1000) throw new Error('Invalid artifact manifest.');
  const contents = new Map<string, {body: Buffer; type: string}>();
  let bytes = 0;
  for(const entry of manifest.files) {
    if(typeof entry.path !== 'string' || artifactPath(entry.path) !== entry.path || !mimeTypes[extname(entry.path)] || contents.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid artifact entry.');
    bytes += entry.bytes;
    if(bytes > CompanionLimits.staticBytes) throw new Error('Artifact exceeds its byte limit.');
    const file = join(base, entry.path.slice(1));
    const canonical = await realpath(file);
    const pathFromBase = relative(base, canonical);
    if(pathFromBase.startsWith('..') || isAbsolute(pathFromBase) || (await lstat(file)).isSymbolicLink()) throw new Error('Artifact escaped its root.');
    const body = await readFile(canonical);
    if(body.length !== entry.bytes || createHash('sha256').update(body).digest('hex') !== entry.sha256) throw new Error('Artifact differs from its manifest.');
    contents.set(entry.path, {body, type: mimeTypes[extname(entry.path)]});
  }
  if(!contents.has('/index.html')) throw new Error('Artifact has no index.html.');
  const workers = manifest.workers ?? [];
  const workerFiles = new Set(manifest.workerFiles ?? []);
  if(!Array.isArray(workers) || !Array.isArray(manifest.workerFiles ?? [])) throw new Error('Invalid artifact workers.');
  for(const file of [...workers, ...workerFiles]) if(typeof file !== 'string' || !file.endsWith('.js') || !contents.has(file)) throw new Error('Worker is outside the artifact.');
  return {contents, workers, workerFiles, hash: createHash('sha256').update(manifestBytes).digest('hex')};
}

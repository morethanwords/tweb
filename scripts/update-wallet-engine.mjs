// Keeps the wallet engine (https://github.com/i582/wallet-engine) on its latest release.
//
// The engine is not published to npm: each GitHub release carries the web package as
// ton-wallet-engine-<version>.tgz next to a .sha256 of it, and package.json depends on that
// asset's URL. This script finds the newest release, checks the tarball against the published
// checksum, re-points the dependency with `pnpm add` and makes sure the lockfile pinned the very
// bytes it checked. It prints the release notes, since an engine release can break its API.
//
//   node scripts/update-wallet-engine.mjs              install the latest release if it is newer
//   node scripts/update-wallet-engine.mjs --check      only report; exits 1 when an update is due
//   node scripts/update-wallet-engine.mjs --tag v0.0.7 install that release (also to roll back)
//
// GITHUB_TOKEN, when set, lifts the API's anonymous rate limit.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const REPO = 'i582/wallet-engine';
const ASSET_RE = /^ton-wallet-engine-.+\.tgz$/;
const RELEASE_URL_RE = new RegExp(`^https://github\\.com/${REPO}/releases/download/([^/]+)/`);

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const wantedTag = args.includes('--tag') ? args[args.indexOf('--tag') + 1] : undefined;

const log = (...parts) => console.log('[wallet-engine]', ...parts);
function fail(message) {
  console.error('[wallet-engine] ' + message);
  process.exit(1);
}

async function request(url, accept) {
  const headers = {'Accept': accept, 'User-Agent': 'tweb-wallet-engine-update'};
  if(process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/')) {
    headers['Authorization'] = 'Bearer ' + process.env.GITHUB_TOKEN;
  }

  let response;
  try {
    response = await fetch(url, {headers});
  } catch(err) {
    fail(`cannot reach ${new URL(url).host}: ${err.cause?.code || err.message}`);
  }

  if(!response.ok) fail(`${url} answered ${response.status} ${response.statusText}`);
  return response;
}

/** The dependency in package.json that points at a release asset of the engine. */
function currentDependency() {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for(const field of ['dependencies', 'devDependencies']) {
    for(const [name, spec] of Object.entries(pkg[field] || {})) {
      const match = spec.match(RELEASE_URL_RE);
      if(match) return {name, url: spec, tag: match[1]};
    }
  }
}

function installedVersion(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
  } catch{}
}

/** The integrity pnpm recorded for a tarball URL. */
function lockedIntegrity(url) {
  const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
  const line = lock.split('\n').find((line) => line.includes(`tarball: ${url}`));
  return line?.match(/integrity: (sha512-[A-Za-z0-9+/=]+)/)?.[1];
}

const release = await (await request(
  `https://api.github.com/repos/${REPO}/releases/${wantedTag ? 'tags/' + wantedTag : 'latest'}`,
  'application/vnd.github+json'
)).json();
const asset = release.assets.find((asset) => ASSET_RE.test(asset.name));
const checksum = asset && release.assets.find((other) => other.name === asset.name + '.sha256');
if(!asset || !checksum) fail(`release ${release.tag_name} has no ${ASSET_RE} with a .sha256 next to it`);

const current = currentDependency();
const pinned = current?.url === asset.browser_download_url;
log(`pinned: ${current ? current.tag : 'none'}, ${wantedTag ? 'requested' : 'latest'}: ${release.tag_name} (${release.published_at.slice(0, 10)})`);

// a check is about the release package.json pins; whether it is installed is the install's business
if(checkOnly) {
  if(pinned) {
    log(installedVersion(current.name) ? 'up to date' : 'up to date (pinned; run pnpm install)');
    process.exit(0);
  }

  log(`update due: ${current?.tag ?? 'none'} → ${release.tag_name}`);
  process.exit(1);
}

// the release installed, not just one: a manifest pulled without an install pins the new one over the old package
if(pinned && installedVersion(current.name) === release.tag_name.replace(/^v/, '')) {
  log('up to date');
  process.exit(0);
}

const tarball = Buffer.from(await (await request(asset.browser_download_url, 'application/octet-stream')).arrayBuffer());
const expected = (await (await request(checksum.browser_download_url, 'application/octet-stream')).text()).match(/\b[a-f0-9]{64}\b/i)?.[0];
const actual = createHash('sha256').update(tarball).digest('hex');
if(!expected || expected.toLowerCase() !== actual) {
  fail(`${asset.name}: sha256 ${actual} does not match the published ${expected ?? '(unreadable checksum)'}`);
}
log(`${asset.name}: ${tarball.length} bytes, sha256 matches the release`);

// what the install changes, kept to put back: a rejected engine never stays installed
const manifests = ['package.json', 'pnpm-lock.yaml'].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
function rollBack(message) {
  manifests.forEach(([file, text]) => fs.writeFileSync(path.join(root, file), text));
  try {
    execFileSync('pnpm', ['install', '--frozen-lockfile'], {cwd: root, stdio: 'inherit'});
  } catch(err) {
    fail(`${message}; package.json and pnpm-lock.yaml are restored, but reinstalling them failed — run pnpm install`);
  }

  fail(`${message}; the previous engine is back`);
}

try {
  execFileSync('pnpm', ['add', asset.browser_download_url], {cwd: root, stdio: 'inherit'});
} catch(err) {
  rollBack(`pnpm add failed: ${err.message}`);
}

// pnpm downloads the asset again on its own: the lockfile has to pin the bytes checked above
const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64');
const locked = lockedIntegrity(asset.browser_download_url);
if(locked !== integrity) {
  rollBack(`pnpm-lock.yaml pinned ${locked ?? 'nothing'} for ${asset.name}, the checked tarball is ${integrity} — not trusting this install`);
}

const {name} = currentDependency();
log(`installed ${name}@${installedVersion(name)} from ${release.tag_name}; restart a running dev server to pick it up`);

const notes = (release.body || '').trim();
log(notes ? `release notes of ${release.tag_name}:\n\n${notes}\n` : `no release notes — see CHANGELOG.md of ${release.tag_name}`);
if(/breaking/i.test(notes)) log('this release has BREAKING changes — check every use of the engine');

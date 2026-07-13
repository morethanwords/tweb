#!/usr/bin/env node
/*
 * Extracts the public/ snapshot from a tweb "Build" commit and serves it locally,
 * mirroring server.js (etag off, Cache-Control: no-store, gzip, static, / -> index.html).
 * Runs in the foreground; launch it with a background Bash so the URL can be reported
 * while it keeps serving. Ctrl-C / SIGTERM stops it and removes the temp dir.
 *
 *   node serve-build.cjs [<sha>] [--index N] [--port P] [--all] [--keep]
 *
 *   <sha>      a commit-ish to serve (short or full). Defaults to the newest build.
 *   --index N  serve the Nth build from list-builds.cjs (1 = newest). Mutually
 *              exclusive with <sha>; add --all to index the same set list --all shows.
 *   --port P   preferred port (default 8099); the next free port is used if taken.
 *   --keep     leave the extracted files on disk after exit (path is printed).
 */

const {execFileSync, spawnSync} = require('child_process');
const express = require('express');        // resolved from the repo's node_modules
const compression = require('compression');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {getBuilds} = require('./list-builds.cjs');

function parseArgs(argv) {
  const args = {port: 8099, index: null, ref: null, all: false, keep: false};
  const positional = [];
  for(let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if(a === '--port') args.port = parseInt(argv[++i], 10);
    else if(a === '--index') args.index = parseInt(argv[++i], 10);
    else if(a === '--all') args.all = true;
    else if(a === '--keep') args.keep = true;
    else positional.push(a);
  }
  if(positional.length) args.ref = positional[0];
  return args;
}

function resolveSha(args) {
  if(args.ref) return execFileSync('git', ['rev-parse', args.ref], {encoding: 'utf8'}).trim();
  const builds = getBuilds(args.all);
  if(!builds.length) throw new Error('No builds found in git history for public/');
  const idx = args.index != null ? args.index : 1;
  const b = builds[idx - 1];
  if(!b) throw new Error(`No build at index ${idx} (have ${builds.length}; run list-builds.cjs)`);
  return b.hash;
}

// git archive <sha>:public streams the public/ subtree with its files at the root;
// extract straight into a temp dir that becomes the web root.
function extract(sha) {
  const short = sha.slice(0, 9);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `tweb-build-${short}-`));
  const tar = execFileSync('git', ['archive', '--format=tar', `${sha}:public`],
    {maxBuffer: 512 * 1024 * 1024});
  const r = spawnSync('tar', ['-x', '-C', dir], {input: tar});
  if(r.status !== 0) throw new Error('tar extract failed: ' + (r.stderr || '').toString());
  return dir;
}

function listen(app, port, attemptsLeft = 20) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve({server, port}));
    server.once('error', (err) => {
      if(err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        resolve(listen(app, port + 1, attemptsLeft - 1));
      } else {
        reject(err);
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sha = resolveSha(args);
  const short = sha.slice(0, 9);
  const meta = execFileSync('git',
    ['show', '-s', '--format=%ad  %s', '--date=format:%Y-%m-%d %H:%M', sha], {encoding: 'utf8'}).trim();

  const root = extract(sha);

  const app = express();
  app.set('etag', false);
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(compression());
  app.use(express.static(root));
  app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));

  const {port} = await listen(app, args.port);

  console.log(`\n  Serving build ${short}  (${meta})`);
  console.log(`  Web root: ${root}`);
  console.log(`\n  →  http://localhost:${port}/\n`);
  console.log('  (Ctrl-C to stop)\n');

  const cleanup = () => {
    if(!args.keep) {
      try { fs.rmSync(root, {recursive: true, force: true}); } catch(_e) {}
    } else {
      console.log(`\n  Kept extracted files at ${root}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('serve-build failed:', err.message);
  process.exit(1);
});

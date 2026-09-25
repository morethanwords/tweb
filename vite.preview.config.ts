/// <reference types="vite/client" />
/*
 * Preview config: extends vite.config.ts and injects a script that seeds
 * localStorage from a freshly minted preview authorization, so the preview
 * boots already logged in — without ever reusing the original seed keys live.
 *
 * The authorization file is PER PREVIEW: pass it via the PREVIEW_SEED env var.
 * Two previews must never share an auth key (parallel use logs both out), so
 * each one gets its own minted session — see scripts/start-preview.sh.
 *
 * Launch (the wrapper mints a fresh auth + picks a free port):
 *   bash scripts/start-preview.sh [--id <id>] [--port <port>] [--remint] [--hmr]
 */

import {mergeConfig} from 'vite';
import {existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, unlinkSync} from 'fs';
import {basename, dirname, join, normalize, resolve} from 'path';
import {spawn, ChildProcess} from 'child_process';
import express from 'express';
import baseConfig from './vite.config';

const seedPath = process.env.PREVIEW_SEED ?
  resolve(process.env.PREVIEW_SEED) :
  resolve(__dirname, 'tmp/seed-preview.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

// Per-seed cache dir so simultaneous preview servers don't clobber each other.
// Keep it inside this worktree: node_modules can be a symlink to the main
// checkout, and preview caches must not write through that shared symlink.
const cacheKey = basename(seedPath).replace(/\.json$/, '');

// Where a built preview bundle lives. start-preview.sh --static/--watch build
// into it up front; the dev server builds into it lazily, on the first request
// that has to be answered without HMR. Keyed by preview id, like the seed.
const staticDir = process.env.TWEB_PREVIEW_STATIC_DIR ||
  resolve(__dirname, 'tmp/preview-dist', cacheKey);

// Hashed names can be pinned forever; the service worker never (a new build has
// to be able to take over), the entry document never, and public/assets — 38 MB
// of unhashed fonts/emoji/tgs — revalidates into a 304 instead of downloading
// again on every load.
const HASHED_ASSET = /-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|wasm|svg|png|json|map)$/;
function cacheControlFor(path: string) {
  if(HASHED_ASSET.test(path) && !basename(path).startsWith('sw-')) {
    return 'public, max-age=31536000, immutable';
  }

  return path === '/' || path.endsWith('.html') ? 'no-store' : 'no-cache';
}

// Rebuilds keep their predecessors (see build.emptyOutDir below), and a rebuild
// that touches the entry cascades new hashes through every chunk that imports it
// — ~40 MB of new files per meaningful edit. Left alone a long session fills the
// disk, so each page load sweeps out builds that are both superseded and older
// than the grace window. The grace is what keeps a page that is mid-load (or a
// phone that opened one minutes ago and is still lazily importing) from 404ing;
// anything older is in the same position as a chunk removed by a deploy.
function readIfComplete(path: string) {
  try {
    const html = readFileSync(path, 'utf8');
    return html.includes('</html>') ? html : undefined;
  } catch{
    return undefined;
  }
}

const PRUNE_GRACE_MS = 10 * 60 * 1000;
let prunedAt = 0;
function pruneSupersededBuilds() {
  if(Date.now() - prunedAt < 60 * 1000) return;
  prunedAt = Date.now();

  try {
    const index = join(staticDir, 'index.html');
    if(!existsSync(index)) return;
    // Every file of the current build is written within a second or so of its
    // index.html; anything measurably older belongs to a previous one.
    const cutoff = Math.min(statSync(index).mtimeMs - 1000, Date.now() - PRUNE_GRACE_MS);
    for(const name of readdirSync(staticDir)) {
      const path = join(staticDir, name);
      // statSync follows `assets` (a symlink into public/) to a directory, so
      // isFile() is what keeps it — and every other non-file — out of this.
      const stat = statSync(path, {throwIfNoEntry: false});
      if(!stat?.isFile() || stat.mtimeMs >= cutoff) continue;
      unlinkSync(path);
    }
  } catch(e) {
    console.warn('[preview] could not prune old builds', e);
  }
}

// Mirrors seedLocalStorage() from src/tests/api/harness.ts, but for the browser:
// every value is JSON.stringify'd, exactly as LocalStorageController writes it.
const seedScript = `(function(){
  try {
    var s = ${JSON.stringify(seed)};
    var dc = s.dcId;
    var fingerprint = s.authKeys[dc].key.slice(0, 8);
    if(localStorage.getItem('account1')) {
      console.log('[preview-auth] account1 already present — keeping existing session');
      return;
    }
    // Seed each minted authorization only ONCE per preview tab. A tweb logout
    // clears localStorage; re-seeding the same keys would just get logged out
    // again — an endless reload loop. The marker lives in window.sessionStorage
    // (NOT localStorage) so a tweb logout cannot wipe it; it still resets when
    // the tab is closed. The fingerprint means a fresh --remint (new keys)
    // re-seeds, but a logout within the same tab does not.
    if(window.sessionStorage.getItem('preview_auth_seeded') === fingerprint) {
      console.log('[preview-auth] session was cleared (logged out?) — not re-seeding the same authorization');
      return;
    }
    window.sessionStorage.setItem('preview_auth_seeded', fingerprint);
    var account = {userId: s.userId, dcId: dc};
    Object.keys(s.authKeys).forEach(function(id){
      var e = s.authKeys[id];
      account['dc' + id + '_auth_key'] = e.key;
      account['dc' + id + '_server_salt'] = e.salt;
      localStorage.setItem('dc' + id + '_auth_key', JSON.stringify(e.key));
      localStorage.setItem('dc' + id + '_server_salt', JSON.stringify(e.salt));
    });
    account.auth_key_fingerprint = fingerprint;
    localStorage.setItem('account1', JSON.stringify(account));
    localStorage.setItem('dc', JSON.stringify(dc));
    localStorage.setItem('user_auth', JSON.stringify({date: Math.floor(Date.now() / 1000), id: s.userId, dcID: dc}));
    localStorage.setItem('auth_key_fingerprint', JSON.stringify(fingerprint));
    localStorage.setItem('server_time_offset', JSON.stringify(s.timeOffset || 0));
    console.log('[preview-auth] seeded session for user', s.userId, 'on dc', dc);
  } catch(e) {
    console.error('[preview-auth] seed failed', e);
  }
})();`;

// Module scope, not per-plugin-instance: Vite re-instantiates every plugin when
// it restarts on a config edit, and a per-instance builder would leave the old
// watcher running next to the new one (two builds racing into one dir) while
// each restart added another exit handler — 11 SIGTERM listeners in, node starts
// warning about a leak.
let builder: ChildProcess;
let exitHandlersAttached = false;
const stopBuilder = () => builder?.kill();

// The dev server gives HMR on localhost, but a request that arrived from
// somewhere else — through whatever proxy fronts this preview — is answered from
// a built bundle instead: unbundled dev modules mean 2047 requests for an
// authorized boot (99 built), each a round trip over the wire, and the HMR
// websocket does not survive a mobile browser backgrounding the tab — the Vite
// client responds to the reconnect by reloading the page out from under whatever
// was being tested.
// ?static=1 forces the bundle from localhost too, ?static=0 forces the dev
// server for a remote request.
function staticForRemotePlugin() {
  const enabled = !!process.env.TWEB_PREVIEW_STATIC_DIR;

  // Lazy on purpose: a desktop-only session never pays for a build it will not
  // look at. Once started, the watcher keeps the bundle in step with edits.
  const startBuilder = () => {
    if(builder) return;
    mkdirSync(dirname(staticDir), {recursive: true});
    const log = openSync(staticDir + '.build.log', 'a');
    builder = spawn('pnpm', [
      '--config.verify-deps-before-run=false', 'exec', 'vite', 'build',
      '--config', 'vite.preview.config.ts', '--outDir', staticDir, '--watch'
    ], {
      cwd: __dirname,
      // KEEP_OUTDIR: a rebuild must not wipe the chunks a page loaded seconds
      // ago is still pulling.
      env: {...process.env, TWEB_PREVIEW_KEEP_OUTDIR: '1'},
      stdio: ['ignore', log, log]
    });
    builder.on('exit', () => {
      builder = undefined;
    });
  };

  const BUILDING = '<!doctype html><meta http-equiv="refresh" content="3">' +
    '<title>building…</title><body style="font:16px/1.5 system-ui;padding:2rem">' +
    'Building this preview\'s bundle (~15 s). The page reloads itself.</body>';

  return {
    name: 'preview-static-for-remote',
    apply: 'serve' as const,
    configureServer(server: any) {
      if(!enabled) return;

      const serve = express.static(staticDir, {
        index: false,
        setHeaders: (res: any, path: string) => res.setHeader('Cache-Control', cacheControlFor(path))
      });

      server.httpServer?.once('close', stopBuilder);
      if(!exitHandlersAttached) {
        exitHandlersAttached = true;
        process.once('exit', stopBuilder);
        process.once('SIGTERM', stopBuilder);
      }

      server.middlewares.use((req: any, res: any, next: any) => {
        const [path, search] = (req.url || '/').split('?');
        const forced = new URLSearchParams(search || '').get('static');
        // The proxy in front of this preview rewrites Host to exactly
        // `localhost`; a browser on this machine always sends the port with it,
        // so a bare `localhost` means the request came from outside. Point the
        // proxy at a Host with a port and this simply stops matching — the app
        // keeps working, ?static=1 still reaches the bundle.
        const viaProxy = req.headers.host === 'localhost';

        if(path === '/' || path === '/index.html') {
          if(forced !== '1' && (forced === '0' || !viaProxy)) return next();
          startBuilder();
          pruneSupersededBuilds();
          // Not just existsSync: rolldown writes index.html in place, so a build
          // killed at the wrong moment (a config edit restarts the watcher)
          // leaves a truncated one behind. Serving that is a blank page with no
          // way out; the closing tag means the write finished.
          if(!readIfComplete(join(staticDir, 'index.html'))) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-store');
            return res.end(BUILDING);
          }
          req.url = '/index.html';
          return serve(req, res, next);
        }

        // Everything else: a file the build emitted wins when it exists. Hashed
        // chunk names cannot collide with the dev server's /src/… or /@vite/…
        // URLs, so this never steals a request from HMR.
        const rel = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
        if(rel === '/' || !existsSync(join(staticDir, rel))) return next();
        return serve(req, res, next);
      });
    }
  };
}

export default mergeConfig(baseConfig as any, {
  cacheDir: resolve(__dirname, 'tmp/vite-preview-cache', cacheKey),
  build: {
    // start-preview.sh --watch sets this. Between rebuilds the out dir must keep
    // the previous hashed chunks: a phone that fetched index.html a second ago is
    // still pulling them, and an emptied dir turns that into a wall of 404s.
    emptyOutDir: !process.env.TWEB_PREVIEW_KEEP_OUTDIR
  },
  // Expose the preview flag to the app bundle. src/config/debug.ts reads it as
  // IS_PREVIEW and uses it to switch off boot-blocking behaviour a non-painting
  // preview tab can't satisfy: the rAF-gated fade-in and the cross-tab dynamic
  // import wait. See src/helpers/dom/previewRaf.ts.
  // VITE_NO_WORKER is set by start-preview.sh --no-worker; Modes.noWorker reads
  // it so the debug launch entry doesn't need ?noWorker=1 in the URL.
  define: {
    'import.meta.env.VITE_PREVIEW': JSON.stringify(true),
    'import.meta.env.VITE_NO_WORKER': JSON.stringify(process.env.TWEB_NO_WORKER === '1')
  },
  plugins: [{
    // `vite preview` (start-preview.sh --static) answers every asset with
    // `Cache-Control: no-cache`, so a phone reloading over the network would
    // revalidate ~100 files one by one — each a round trip to this machine.
    name: 'preview-static-headers',
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const path = (req.url || '').split('?')[0];
        if(path === '/' || path.endsWith('.html')) pruneSupersededBuilds();
        res.setHeader('Cache-Control', cacheControlFor(path));
        next();
      });
    }
  }, staticForRemotePlugin(), {
    name: 'preview-auth-seed',
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [{tag: 'script', injectTo: 'head-prepend', children: seedScript}]
      };
    }
  }]
});

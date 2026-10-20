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

import {loadEnv, mergeConfig} from 'vite';
import {existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync} from 'fs';
import {createHash} from 'crypto';
import {basename, dirname, join, normalize, resolve} from 'path';
import {execFileSync, spawn, ChildProcess} from 'child_process';
import {connect} from 'net';
import express from 'express';
import baseConfig from './vite.config';

const seedPath = process.env.PREVIEW_SEED ?
  resolve(process.env.PREVIEW_SEED) :
  resolve(__dirname, 'tmp/seed-preview.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
// the preview's second account (start-preview.sh with TWEB_SECOND_SEED)
const seed2 = process.env.PREVIEW_SEED_2 ?
  JSON.parse(readFileSync(resolve(process.env.PREVIEW_SEED_2), 'utf8')) :
  undefined;

// Per-seed cache dir so simultaneous preview servers don't clobber each other.
// Keep it inside this worktree: node_modules can be a symlink to the main
// checkout, and preview caches must not write through that shared symlink.
const cacheKey = basename(seedPath).replace(/\.json$/, '');

// Where a built preview bundle lives. start-preview.sh --static/--watch build
// into it up front; the dev server builds into it lazily, on the first request
// that has to be answered without HMR. Keyed by preview id, like the seed.
const staticDir = process.env.TWEB_PREVIEW_STATIC_DIR ||
  resolve(__dirname, 'tmp/preview-dist', cacheKey);

// The main checkout: this one, or the one a worktree hangs off.
const mainCheckout = (() => {
  try {
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {cwd: __dirname, encoding: 'utf8'});
    return dirname(resolve(__dirname, commonDir.trim()));
  } catch{
    return __dirname;
  }
})();

// Where a remote request that says nothing (no ?static=) lands: the built
// bundle by default, or — with TWEB_PREVIEW_REMOTE=dev in the environment or in
// .env.local — the dev server with HMR, for a machine whose previews are only
// ever reached through the proxy. ?static=1 still gets the bundle. A worktree's
// .env.local starts empty (vite.config.ts copies the example), so one that says
// nothing defers to the main checkout's: the knob is about the machine, and
// every new worktree would otherwise come up serving the bundle.
const remoteGetsDev = (process.env.TWEB_PREVIEW_REMOTE ??
  loadEnv('development', __dirname, 'TWEB_PREVIEW_').TWEB_PREVIEW_REMOTE ??
  loadEnv('development', mainCheckout, 'TWEB_PREVIEW_').TWEB_PREVIEW_REMOTE) === 'dev';

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
    // the test-DC session is kept under keys of its own (LocalStorage's prefix in Modes.test)
    var p = s.isTest ? 't_' : '';
    var localStorage = {
      getItem: function(key) { return window.localStorage.getItem(p + key); },
      setItem: function(key, value) { window.localStorage.setItem(p + key, value); }
    };
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
    console.log('[preview-auth] seeded session for user', s.userId, 'on', s.isTest ? 'test dc' : 'dc', dc);
  } catch(e) {
    console.error('[preview-auth] seed failed', e);
  }
})();` + (seed2 ? `
(function(){
  try {
    var s = ${JSON.stringify(seed2)};
    var dc = s.dcId;
    var fingerprint = s.authKeys[dc].key.slice(0, 8);
    var p = s.isTest ? 't_' : '';
    if(window.localStorage.getItem(p + 'account2')) return;
    // once per tab, as for account1 above
    if(window.sessionStorage.getItem('preview_auth_seeded_2') === fingerprint) return;
    window.sessionStorage.setItem('preview_auth_seeded_2', fingerprint);
    var account = {userId: s.userId, dcId: dc, auth_key_fingerprint: fingerprint};
    Object.keys(s.authKeys).forEach(function(id){
      account['dc' + id + '_auth_key'] = s.authKeys[id].key;
      account['dc' + id + '_server_salt'] = s.authKeys[id].salt;
    });
    window.localStorage.setItem(p + 'account2', JSON.stringify(account));
    window.localStorage.setItem(p + 'number_of_accounts', JSON.stringify(2));
    console.log('[preview-auth] seeded the second account, user', s.userId);
  } catch(e) {
    console.error('[preview-auth] second seed failed', e);
  }
})();` : '');

// Module scope, not per-plugin-instance: Vite re-instantiates every plugin when
// it restarts on a config edit, and a per-instance builder would leave the old
// watcher running next to the new one (two builds racing into one dir) while
// each restart added another exit handler — 11 SIGTERM listeners in, node starts
// warning about a leak.
let builder: ChildProcess;
let exitHandlersAttached = false;
const stopBuilder = () => builder?.kill();

// A watched bundle (the one built for remote requests, start-preview.sh --watch)
// reloads itself once a newer build has landed. Each build is named by what it
// holds — a hash of its file names and index.html, so a rebuild that changed
// nothing changes no name — and stamped with when it was made; the name and the
// stamp go into its index.html, and into preview-build.json after every file of
// it is on disk. The page asks /_preview-build for the build to come, and the
// server answers when there is one newer than the page's, or after 25 s: a long
// poll, a request every half minute while nothing happens. There is no websocket
// to lose when a phone puts the tab away, which is why this bundle exists; a
// hidden tab asks nothing, and catches up with one reload once it is shown.
// Neither path has an extension: the app's service worker caches every *.json
// it sees, under each query separately. ?autoreload=0 turns it off for the tab
// (a call, a draft — anything a reload would throw away).
const BUILD_FILE = 'preview-build.json';
const BUILD_PATH = '/_preview-build';
const BUILD_WAIT_MS = 25 * 1000;

type PreviewBuild = {id: string, time: number};

const autoReloadScript = (build: PreviewBuild) => `(() => {
  try {
    const asked = new URLSearchParams(location.search).get('autoreload');
    if(asked !== null) sessionStorage.setItem('preview-autoreload', asked);
    if(sessionStorage.getItem('preview-autoreload') === '0') return;
  } catch{}

  const {id, time} = ${JSON.stringify(build)};
  const shown = () => new Promise((resolve) => {
    if(!document.hidden) return resolve();
    document.addEventListener('visibilitychange', () => shown().then(resolve), {once: true});
  });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  (async() => {
    for(;;) {
      await shown();
      try {
        const response = await fetch('${BUILD_PATH}?id=' + id + '&time=' + time, {cache: 'no-store'});
        if(!response.ok) throw new Error('HTTP ' + response.status);
        const build = await response.json();
        if(build && build.id !== id && build.time > time) {
          await shown();
          location.reload();
          return;
        }
      } catch(err) {
        console.warn('[preview] could not ask for the next build:', err);
        await sleep(10 * 1000);
      }
    }
  })();
})();`;

function readBuild(dir: string): PreviewBuild | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, BUILD_FILE), 'utf8'));
  } catch{
    return undefined;
  }
}

// GET /_preview-build?id=…&time=… — held until the bundle in `dir` is another,
// newer build than that, or for BUILD_WAIT_MS; then the build it is at.
function buildWaitMiddleware(dir: string) {
  return (req: any, res: any, next: any) => {
    const [path, search] = (req.url || '').split('?');
    if(path !== BUILD_PATH) return next();

    const params = new URLSearchParams(search || '');
    const id = params.get('id');
    const time = Number(params.get('time')) || 0;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const build = readBuild(dir);
      if(!(build && build.id !== id && build.time > time) && Date.now() - started < BUILD_WAIT_MS) {
        timer = setTimeout(check, 500);
        return;
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(build || null));
    };

    // the response's close, not the request's: a request closes once its (empty) body is read
    res.on('close', () => clearTimeout(timer));
    check();
  };
}

function previewAutoReloadPlugin() {
  let watched = false;
  let outDir: string;
  let build: PreviewBuild;

  return {
    name: 'preview-auto-reload',
    configResolved(config: any) {
      watched = config.command === 'build' && !!config.build.watch;
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle: {
      // after vite:build-html has put index.html into the bundle
      order: 'post' as const,
      handler(_options: any, bundle: Record<string, any>) {
        const html = bundle['index.html'];
        if(!watched || html?.type !== 'asset') return;

        const names = Object.keys(bundle).filter((name) => !name.endsWith('.html')).sort();
        const id = createHash('sha1').update(names.join('\n')).update(String(html.source)).digest('hex').slice(0, 12);
        build = {id, time: Date.now()};
        html.source = String(html.source).replace('</head>', `<script>${autoReloadScript(build)}</script></head>`);
      }
    },
    // after every file is written, so a page reloading on it finds all of them;
    // through a rename, so a reader never sees half of it
    writeBundle() {
      if(!watched || !build) return;
      const path = join(outDir, BUILD_FILE);
      writeFileSync(path + '.tmp', JSON.stringify(build));
      renameSync(path + '.tmp', path);
    },
    configureServer(server: any) {
      // the bundle the dev server builds for remote requests (staticForRemotePlugin)
      if(process.env.TWEB_PREVIEW_STATIC_DIR) server.middlewares.use(buildWaitMiddleware(staticDir));
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(buildWaitMiddleware(staticDir));
    }
  };
}

// The dev server gives HMR on localhost, but a request that arrived from
// somewhere else — through whatever proxy fronts this preview — is answered from
// a built bundle instead: unbundled dev modules mean 2047 requests for an
// authorized boot (99 built), each a round trip over the wire, and the HMR
// websocket does not survive a mobile browser backgrounding the tab — the Vite
// client responds to the reconnect by reloading the page out from under whatever
// was being tested.
// ?static=1 forces the bundle from localhost too, ?static=0 forces the dev
// server for a remote request; TWEB_PREVIEW_REMOTE=dev makes that the default.
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
      // NODE_ENV: the dev server has set it to development, and a build that
      // inherits that ships Solid's dev runtime and starts vite.config.ts's own
      // lang and SCSS-types watchers next to the dev server's.
      env: {...process.env, NODE_ENV: 'production', TWEB_PREVIEW_KEEP_OUTDIR: '1'},
      stdio: ['ignore', log, log]
    });
    builder.on('exit', () => {
      builder = undefined;
    });
  };

  const BUILDING = '<!doctype html><meta http-equiv="refresh" content="3">' +
    '<title>building…</title><body style="font:16px/1.5 system-ui;padding:2rem">' +
    'Building this preview\'s bundle (~20 s). The page reloads itself.</body>';

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
          if(forced !== '1' && (forced === '0' || !viaProxy || remoteGetsDev)) return next();
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

// Every preview start-preview.sh starts is registered in tmp/previews/ of the
// MAIN checkout, shared by all worktrees, so any preview can list them all. Each
// is named by its checkout's tmp/preview-label (`start-preview.sh --label`):
// a word or two about the task. scripts/preview-switcher.js puts that name at
// the head of the tab title and in a badge that lists the rest; /_previews is
// the same list as a page of its own, /_previews/list as data (no extension: the
// app's service worker would cache a *.json for good).
const previewRegistry = join(mainCheckout, 'tmp/previews');
const switcherScript = resolve(__dirname, 'scripts/preview-switcher.js');

function readFirstLine(path: string) {
  try {
    return readFileSync(path, 'utf8').split('\n')[0].trim();
  } catch{
    return '';
  }
}

// The registry's meta files: KEY=value lines.
function readKeyValues(path: string) {
  const values: Record<string, string> = {};
  for(const line of readFileSync(path, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if(i > 0) values[line.slice(0, i)] = line.slice(i + 1);
  }
  return values;
}

// What a checkout serves: its branch, or the commit a detached HEAD sits on.
function branchOf(repo: string) {
  try {
    let gitDir = join(repo, '.git');
    // a worktree's .git is a file that points at its git dir
    if(statSync(gitDir).isFile()) {
      gitDir = resolve(repo, readFileSync(gitDir, 'utf8').replace(/^gitdir:/, '').trim());
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : head.slice(0, 9);
  } catch{
    return '';
  }
}

function processAlive(pid: number) {
  // kill(0) would signal our own process group, and answer for it
  if(!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch(e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function portAnswers(port: number) {
  return new Promise<boolean>((settle) => {
    const socket = connect({host: '127.0.0.1', port});
    const done = (answers: boolean) => {
      socket.destroy();
      settle(answers);
    };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function listPreviews() {
  let ports: string[];
  try {
    ports = readdirSync(previewRegistry).filter((name) => /^\d+$/.test(name));
  } catch{
    return [];
  }

  const previews = ports.sort((a, b) => +a - +b).map((port) => {
    try {
      const meta = readKeyValues(join(previewRegistry, port, 'meta'));
      // start-preview.sh forgets a dead preview only on its next run
      if(!processAlive(+meta.PID)) return;
      return {
        port: +port,
        label: readFirstLine(join(meta.REPO, 'tmp/preview-label')),
        checkout: meta.REPO === mainCheckout ? '' : basename(meta.REPO),
        branch: branchOf(meta.REPO),
        // one checkout can run a preview per mode (--watch, --bundled, …) under the same label
        mode: meta.MODE
      };
    } catch{
      // an entry start-preview.sh is still writing, or has just removed
    }
  }).filter(Boolean);

  const up = await Promise.all(previews.map((preview) => portAnswers(preview.port)));
  return previews.map((preview, i) => ({...preview, up: up[i]}));
}

function previewSwitcherPlugin() {
  const middleware = (req: any, res: any, next: any) => {
    const path = (req.url || '').split('?')[0];
    if(path === '/_previews/list') {
      listPreviews().then((previews) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        // the port the request came in on is the preview that answers it
        res.end(JSON.stringify({current: req.socket.localPort, previews}));
      }, next);
      return;
    }

    if(path === '/_previews') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end('<!doctype html><html lang="en"><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Previews</title>' +
        `<body style="margin:0;font-family:system-ui,-apple-system,sans-serif"><script>${readFileSync(switcherScript, 'utf8')}</script></body></html>`);
      return;
    }

    next();
  };

  return {
    name: 'preview-switcher',
    configureServer(server: any) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(middleware);
    },
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [{tag: 'script', injectTo: 'body', children: readFileSync(switcherScript, 'utf8')}]
      };
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
  // VITE_TEST_DC comes from the seed: an account on the test DCs boots in test mode (Modes.test),
  // in the page and in its workers alike, without ?test=1 in every link.
  define: {
    'import.meta.env.VITE_PREVIEW': JSON.stringify(true),
    'import.meta.env.VITE_NO_WORKER': JSON.stringify(process.env.TWEB_NO_WORKER === '1'),
    'import.meta.env.VITE_TEST_DC': JSON.stringify(!!seed.isTest)
  },
  plugins: [{
    // start-preview.sh --bundled runs the dev server with --experimentalBundle:
    // Vite's Full Bundle Mode keeps a rolldown bundle in memory and serves that —
    // ~35 requests for a signed-in boot instead of ~1700 modules — and an
    // edit recompiles the one module and hot-patches it in. Rebuilding regroups
    // modules, and the app's import cycles then ran in the wrong order: after the
    // first edit the page died on `class ChatInviteLink extends InviteLink` with
    // InviteLink still undefined. Strict order runs every module where its
    // importer asked for it.
    name: 'preview-bundled-dev',
    apply: 'serve',
    config(config: any) {
      if(config.experimental?.bundledDev) {
        return {build: {rolldownOptions: {output: {strictExecutionOrder: true}}}};
      }
    }
  }, {
    // The watched bundle (start-preview.sh --watch, and the one built for remote
    // requests) is rebuilt on every edit, and source maps are half of each
    // rebuild (~2 s of ~4). TWEB_PREVIEW_SOURCEMAP=0 drops them — and with them
    // the way to symbolicate that bundle's logs (src/scripts/symbolicate-logs.js).
    name: 'preview-watch-sourcemap',
    apply: 'build',
    config(config: any) {
      if(config.build?.watch && process.env.TWEB_PREVIEW_SOURCEMAP === '0') {
        return {build: {sourcemap: false}};
      }
    }
  }, {
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
  }, previewSwitcherPlugin(), staticForRemotePlugin(), previewAutoReloadPlugin(), {
    name: 'preview-auth-seed',
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [{tag: 'script', injectTo: 'head-prepend', children: seedScript}]
      };
    }
  }]
});

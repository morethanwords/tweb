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
 *   bash scripts/start-preview.sh [--id <id>] [--port <port>] [--remint]
 */

import {mergeConfig} from 'vite';
import {readFileSync} from 'fs';
import {basename, resolve} from 'path';
import baseConfig from './vite.config';

const seedPath = process.env.PREVIEW_SEED ?
  resolve(process.env.PREVIEW_SEED) :
  resolve(__dirname, 'tmp/seed-preview.json');
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));

// per-seed cache dir so simultaneous preview servers don't clobber each other
const cacheKey = basename(seedPath).replace(/\.json$/, '');

// Mirrors seedLocalStorage() from src/tests/api/harness.ts, but for the browser:
// every value is JSON.stringify'd, exactly as LocalStorageController writes it.
const seedScript = `(function(){
  try {
    if(localStorage.getItem('account1')) {
      console.log('[preview-auth] account1 already present — keeping existing session');
      return;
    }
    var s = ${JSON.stringify(seed)};
    var dc = s.dcId;
    var account = {userId: s.userId, dcId: dc};
    Object.keys(s.authKeys).forEach(function(id){
      var e = s.authKeys[id];
      account['dc' + id + '_auth_key'] = e.key;
      account['dc' + id + '_server_salt'] = e.salt;
      localStorage.setItem('dc' + id + '_auth_key', JSON.stringify(e.key));
      localStorage.setItem('dc' + id + '_server_salt', JSON.stringify(e.salt));
    });
    var fingerprint = s.authKeys[dc].key.slice(0, 8);
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

export default mergeConfig(baseConfig as any, {
  cacheDir: `node_modules/.vite-preview-${cacheKey}`,
  // the project's public/ holds stale build chunks with unresolved git merge
  // markers; vite would otherwise crawl public/index.html etc. as dep-scan
  // entries and choke — restrict the scan to the real app entry
  optimizeDeps: {entries: ['index.html']},
  plugins: [{
    name: 'preview-auth-seed',
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [{tag: 'script', injectTo: 'head-prepend', children: seedScript}]
      };
    }
  }]
});

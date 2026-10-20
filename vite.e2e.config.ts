/*
 * The server the Playwright suites run against: the dev server, minus hot reload and file
 * watching. A suite runs for minutes, and an edit anywhere in the checkout during that time — the
 * change being tested, or another session's — would full-reload the page under a test that is
 * half done ("Execution context was destroyed, most likely because of a navigation").
 */
import {existsSync, readdirSync, readFileSync, statSync} from 'fs';
import {resolve} from 'path';
import {normalizePath, type Plugin, type UserConfig} from 'vite';
import baseConfig from './vite.config';

// Nothing the server gives out changes during a run (no watcher, no hot reload), so every module can
// be cached for the run instead of answering `no-cache`: a worker's pages after its first then boot
// from the browser cache rather than revalidating every module with the server one by one.
export const cacheModulesForTheRun: Plugin = {
  name: 'e2e-cache-modules-for-the-run',
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      const setHeader = res.setHeader;
      res.setHeader = function(name, value) {
        const noCache = name.toLowerCase() === 'cache-control' && value === 'no-cache';
        return setHeader.call(this, name, noCache ? 'max-age=3600' : value);
      };
      next();
    });
  }
};

/**
 * `window.e2eImport('/src/…')` in the page: the app's own instance of a module, for a test that reaches into one
 * (`rootScope`, a store, a popup to open) or loads a harness of e2e/fixtures into the app.
 *
 * Served module by module, that is a plain `import()` of the URL, from a script of the page: a module's URL is its
 * identity there, and the URL the app imports it by has no query. (From a module Vite serves, `import(path)` would be
 * rewritten to add `?import`, a URL of its own, and so a second instance.) The popup suites' server serves a bundle
 * (vite.popups-e2e.config.ts), where no module has a URL: there a map of import()s is compiled with the app, so an
 * import from it is the app's own — of a module already run, the live instance, of one not yet, its first.
 *
 * The map holds the modules the specs name, every `'/src/…'` and `'/e2e/fixtures/…'` string in e2e/: a path is
 * written whole where it is imported. Each import() in it is a point the bundle is split at, and a map of every
 * module split it into ~1650 chunks, which a page then loaded one by one.
 */
const E2E_IMPORT = 'virtual:e2e-import';
function namedModules() {
  const named = new Set<string>();
  const dir = resolve(__dirname, 'e2e');
  for(const file of readdirSync(dir).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for(const [, path] of source.matchAll(/['"`](\/(?:src|e2e\/fixtures)\/[\w./-]+\.(?:tsx?|scss))['"`]/g)) named.add(path);
  }
  return [...named].filter((path) => existsSync(resolve(__dirname, path.slice(1)))).sort();
}

export const e2eImport: Plugin = (() => {
  let bundled = false;
  return {
    name: 'e2e-import',
    configResolved(config) {
      bundled = !!config.experimental?.bundledDev;
    },
    transformIndexHtml() {
      if(!bundled) return [{tag: 'script', children: 'window.e2eImport = (path) => import(path);', injectTo: 'head-prepend'}];
    },
    resolveId(id) {
      if(id === E2E_IMPORT) return '\0' + E2E_IMPORT;
    },
    load(id) {
      if(id !== '\0' + E2E_IMPORT) return;
      const modules = namedModules().map((path) => `  ${JSON.stringify(path)}: () => import(${JSON.stringify(path)})`);
      return `const modules = {\n${modules.join(',\n')}\n};
window.e2eImport = (path) => modules[path] ? modules[path]() :
  Promise.reject(new Error('e2eImport: ' + path + ' is named nowhere in e2e/ as a whole path, so the bundle has no import of it'));
`;
    },
    transform(code, id) {
      // Vite's ids have forward slashes wherever the paths do not
      if(bundled && id.split('?')[0] === normalizePath(resolve(__dirname, 'src/index.ts'))) return {code: `${code}\nimport '${E2E_IMPORT}';\n`, map: null};
    }
  };
})();

/**
 * `/__e2e/ready` answers 503 until a bundling server (Vite's Full Bundle Mode) has its first bundle, and 200 once it
 * has, or at once on a server that bundles nothing. Before the bundle a page gets a stand-in that waits for it over
 * the hot-update socket, which these servers do not have: the stand-in would wait for ever. So a suite's
 * `webServer.url` is this.
 */
export const bundleReady: Plugin = {
  name: 'e2e-bundle-ready',
  configureServer(server) {
    server.middlewares.use('/__e2e/ready', (_req, res) => {
      const bundled = server.environments.client.bundledDev as unknown as {initialBuildCompleted: boolean} | undefined;
      res.statusCode = !bundled || bundled.initialBuildCompleted ? 200 : 503;
      res.end();
    });
  }
};

/**
 * The dependency pre-bundling for a server whose cache lives in `cacheDir`. The forks in src/vendor
 * (Solid) are pre-bundled with the packages, but being outside node_modules an edit to them does not
 * invalidate that cache, which then serves the unpatched fork. So the cache is rebuilt when a fork is
 * newer than it — rather than on every start, which `--force` did at ~3 s a run.
 */
export function optimizeDepsFor(cacheDir: string, optimizeDeps = baseConfig.optimizeDeps): UserConfig['optimizeDeps'] {
  const metadata = resolve(cacheDir, 'deps/_metadata.json');
  const built = existsSync(metadata) && statSync(metadata).mtimeMs;
  const hasNewer = (directory: string): boolean => readdirSync(directory, {withFileTypes: true}).some((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? hasNewer(path) : statSync(path).mtimeMs > built;
  });
  return {...optimizeDeps, force: !!built && hasNewer(resolve(__dirname, 'src/vendor'))};
}

const cacheDir = resolve(__dirname, 'tmp/vite-e2e-cache');

const config: UserConfig = {
  ...baseConfig,
  // Its own dependency cache, so a dev server re-optimising `node_modules/.vite` does not pull
  // modules out from under a run.
  cacheDir,
  optimizeDeps: optimizeDepsFor(cacheDir),
  plugins: [...baseConfig.plugins, e2eImport, bundleReady],
  server: {
    ...baseConfig.server,
    hmr: false,
    watch: null
  }
};

export default config;

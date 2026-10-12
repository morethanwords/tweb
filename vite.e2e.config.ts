/*
 * The server the Playwright suites run against: the dev server, minus hot reload and file
 * watching. A suite runs for minutes, and an edit anywhere in the checkout during that time — the
 * change being tested, or another session's — would full-reload the page under a test that is
 * half done ("Execution context was destroyed, most likely because of a navigation").
 */
import {existsSync, readdirSync, statSync} from 'fs';
import {resolve} from 'path';
import type {Plugin, UserConfig} from 'vite';
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
  server: {
    ...baseConfig.server,
    hmr: false,
    watch: null
  }
};

export default config;

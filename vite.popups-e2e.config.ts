import {resolve} from 'path';
import type {Plugin, UserConfig} from 'vite';
import e2eConfig from './vite.e2e.config';

// Nothing the server gives out changes during a run (no watcher, no hot reload), so every module can
// be cached for the run instead of answering `no-cache`: a worker's pages after its first then boot
// from the browser cache rather than revalidating ~1600 modules with the server one by one.
const cacheModulesForTheRun: Plugin = {
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

export default {
  ...e2eConfig,
  cacheDir: resolve(__dirname, 'node_modules/.vite-popup-e2e'),
  plugins: [...e2eConfig.plugins, cacheModulesForTheRun]
} satisfies UserConfig;

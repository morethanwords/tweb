/*
 * The server the Playwright suites run against: the dev server, minus hot reload and file
 * watching. A suite runs for minutes, and an edit anywhere in the checkout during that time — the
 * change being tested, or another session's — would full-reload the page under a test that is
 * half done ("Execution context was destroyed, most likely because of a navigation").
 */
import {resolve} from 'path';
import type {UserConfig} from 'vite';
import baseConfig from './vite.config';

const config: UserConfig = {
  ...baseConfig,
  // Its own dependency cache, so a dev server re-optimising `node_modules/.vite` does not pull
  // modules out from under a run.
  cacheDir: resolve(__dirname, 'tmp/vite-e2e-cache'),
  server: {
    ...baseConfig.server,
    hmr: false,
    watch: null
  }
};

export default config;

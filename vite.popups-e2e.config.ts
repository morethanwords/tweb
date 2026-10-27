/*
 * The sandbox suites' server (test:popups, test:focus, test:a11y). Every test opens the app anew, and served module
 * by module that is ~1800 requests a page: ~5 s alone, ~25 s each with a full run's 24 pages at once. So it serves a
 * bundle (Vite's Full Bundle Mode, as start-preview.sh --bundled does): ~440 chunks a page, under 2 s alone and ~7 s
 * with 24 at once, for one build of ~25 s when the server starts. A test reaches into the app with window.e2eImport
 * (vite.e2e.config.ts), never by a module's URL, which a bundle does not have.
 *
 * TWEB_E2E_BUNDLED=0 serves the modules as they are: the hot-update spec runs them again one by one, on a server of
 * its own (playwright.popups.config.ts).
 */
import {resolve} from 'path';
import type {Plugin, PluginOption, UserConfig} from 'vite';
import e2eConfig, {cacheModulesForTheRun, optimizeDepsFor} from './vite.e2e.config';

const bundled = process.env.TWEB_E2E_BUNDLED !== '0';
// a cache per mode: the two servers of a run start side by side
const cacheDir = resolve(__dirname, bundled ? 'node_modules/.vite-popup-e2e' : 'node_modules/.vite-popup-e2e-modules');
const rolldownOptions = e2eConfig.build.rolldownOptions;

// a plugin list, its nested lists flattened, without the plugin of that name
function without(plugins: PluginOption[], name: string): PluginOption[] {
  return plugins.flatMap((plugin) => Array.isArray(plugin) ? without(plugin, name) : (plugin as Plugin)?.name === name ? [] : [plugin]);
}

export default {
  ...e2eConfig,
  cacheDir,
  optimizeDeps: optimizeDepsFor(cacheDir),
  plugins: [
    // the hot updates' transform keeps state per module, and in a bundle every module is the bundle's one file: the
    // page took each boot for an edit and reloaded itself for ever. Nothing on this server is updated hot anyway.
    ...(bundled ? without(e2eConfig.plugins, 'tweb-hot-reload') : e2eConfig.plugins),
    cacheModulesForTheRun
  ],
  ...(bundled && {
    experimental: {bundledDev: true},
    build: {
      ...e2eConfig.build,
      rolldownOptions: {
        ...rolldownOptions,
        // Every dynamic import compiled with the rest, up front. Compiled when first imported, it left the bundle
        // stale, and the next page got the stand-in that waits for a rebuild over the hot-update socket.
        experimental: {devMode: {lazy: false}},
        // the app's import cycles run in the order their importers ask for them (vite.preview.config.ts)
        output: {...rolldownOptions.output, strictExecutionOrder: true}
      }
    }
  })
} satisfies UserConfig;

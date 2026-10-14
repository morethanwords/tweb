import {resolve} from 'path';
import {defineConfig, type AliasOptions} from 'vite';
// the e2e server: no hot reload and no watching, so an edit while the suite runs does not reload the
// page under a test that is half done
import e2eConfig, {cacheModulesForTheRun, optimizeDepsFor} from './vite.e2e.config';

const fixtureStubs = [
  ['@components/buttonMenu', 'buttonMenu.ts'],
  ['@components/buttonMenuToggle', 'buttonMenuToggle.ts'],
  ['@components/createSubmenuTrigger', 'createSubmenuTrigger.ts'],
  ['@lib/customEmoji/element', 'customEmojiElement.ts'],
  ['@lib/customEmoji/renderer', 'customEmojiRenderer.ts'],
  ['@lib/langPack', 'langPack.ts']
] as const;

function aliasEntries(aliases: AliasOptions = []) {
  return Array.isArray(aliases) ? aliases : Object.entries(aliases).map(([find, replacement]) => ({
    find,
    replacement
  }));
}

const base = e2eConfig;
const baseOptimizeEntries = Array.isArray(base.optimizeDeps?.entries) ? base.optimizeDeps.entries : [];
const stubDirectory = resolve(__dirname, 'e2e/fixtures/stubs');
const cacheDir = resolve(__dirname, 'node_modules/.vite-editor-e2e');

export default defineConfig({
  ...base,
  cacheDir,
  plugins: [...base.plugins, cacheModulesForTheRun],
  server: {
    ...base.server,
    // transformed while the workers launch their browsers, rather than by every worker's first page at
    // once: the app's stylesheet alone is most of a cold load
    warmup: {clientFiles: ['./e2e/fixtures/chatInputEditor.ts']}
  },
  optimizeDeps: {
    ...optimizeDepsFor(cacheDir, base.optimizeDeps),
    entries: [
      'e2e/fixtures/chatInputEditor.html',
      ...baseOptimizeEntries.filter((entry) => entry !== 'index.html')
    ]
  },
  resolve: {
    ...base.resolve,
    // Exact fixture modules must precede the broad `@components` / `@lib`
    // aliases from the application config.
    alias: [
      ...fixtureStubs.map(([find, file]) => ({
        find,
        replacement: resolve(stubDirectory, file)
      })),
      ...aliasEntries(base.resolve?.alias)
    ]
  }
});

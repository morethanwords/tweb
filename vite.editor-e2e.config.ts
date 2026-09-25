import {resolve} from 'path';
import {defineConfig, type AliasOptions, type UserConfig} from 'vite';
import baseConfig from './vite.config';

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

const base = baseConfig as UserConfig;
const baseOptimizeEntries = Array.isArray(base.optimizeDeps?.entries) ? base.optimizeDeps.entries : [];
const stubDirectory = resolve(__dirname, 'e2e/fixtures/stubs');

export default defineConfig({
  ...base,
  cacheDir: resolve(__dirname, 'node_modules/.vite-editor-e2e'),
  optimizeDeps: {
    ...base.optimizeDeps,
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

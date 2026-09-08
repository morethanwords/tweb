import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';
import {solidAliases} from './scripts/solid-aliases.ts';
import {artifactPlugin} from './scripts/artifact-plugin.ts';

export default defineConfig({
  plugins: [solid({dev: false}), artifactPlugin()],
  publicDir: false,
  worker: {format: 'es', plugins: () => [artifactPlugin('worker')]},
  resolve: {alias: solidAliases, conditions: ['browser', 'production']},
  build: {
    outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false,
    modulePreload: {polyfill: false}, assetsInlineLimit: 0,
    cssTarget: ['chrome120', 'safari17'],
    rolldownOptions: {input: 'index.html'}
  }
});

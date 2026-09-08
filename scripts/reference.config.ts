import {defineConfig} from 'vite';
import solid from 'vite-plugin-solid';
import {resolve} from 'node:path';
import {root, solidAliases} from './solid-aliases.ts';

export default defineConfig({
  root: resolve(root, 'reference'),
  publicDir: resolve(root, 'reference/static'),
  plugins: [solid({dev: false})],
  resolve: {alias: solidAliases, conditions: ['browser', 'production']},
  build: {
    outDir: resolve(root, 'reference-dist'), emptyOutDir: true, target: 'es2022',
    sourcemap: false, assetsInlineLimit: 0, modulePreload: {polyfill: false},
    cssTarget: ['chrome120', 'safari17'],
    rolldownOptions: {input: {index: resolve(root, 'reference/index.html'), candidate: resolve(root, 'reference/candidate.html')}}
  }
});

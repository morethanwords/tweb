import {resolve} from 'path';
import {defineConfig, type UserConfig} from 'vite';
import baseConfig from './vite.config';

export default defineConfig({
  ...baseConfig as UserConfig,
  cacheDir: resolve(__dirname, 'node_modules/.vite-popup-e2e')
});

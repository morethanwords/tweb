import {resolve} from 'path';
import type {UserConfig} from 'vite';
import e2eConfig, {cacheModulesForTheRun, optimizeDepsFor} from './vite.e2e.config';

const cacheDir = resolve(__dirname, 'node_modules/.vite-popup-e2e');

export default {
  ...e2eConfig,
  cacheDir,
  optimizeDeps: optimizeDepsFor(cacheDir),
  plugins: [...e2eConfig.plugins, cacheModulesForTheRun]
} satisfies UserConfig;

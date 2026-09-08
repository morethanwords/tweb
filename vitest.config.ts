import {defineConfig} from 'vitest/config';
import {solidAliases} from './scripts/solid-aliases.ts';

export default defineConfig({
  resolve: {alias: solidAliases, conditions: ['browser', 'production']},
  test: {
    include: ['src/shell/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node', maxWorkers: 2, passWithNoTests: false
  }
});

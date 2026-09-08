import {createHash} from 'node:crypto';
import {readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';

export const sourceDirectories = ['src', 'scripts', 'tests', 'reference', 'notices'];
export const sourceRootFiles = [
  '.npmrc', 'package.json', 'pnpm-lock.yaml', 'index.html', 'companion.html',
  'tsconfig.json', 'vite.config.ts', 'vite.companion.config.ts', 'vitest.config.ts',
  'playwright.config.ts', 'playwright.companion.config.ts'
];
const digest = value => createHash('sha256').update(value).digest('hex');

/** Build and verification share the same input inventory, including generated Code assets. */
export async function readSourceSnapshot(root = process.cwd()) {
  const files = [...sourceRootFiles];
  async function walk(directory) {
    for(const entry of await readdir(join(root, directory), {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if(entry.isDirectory()) await walk(path);
      else if(entry.isFile()) files.push(path);
      else throw new Error('Unsupported source entry: ' + path);
    }
  }
  for(const directory of sourceDirectories) await walk(directory);
  const sourceHashes = Object.fromEntries(await Promise.all(files.sort().map(async path => [path, digest(await readFile(join(root, path)))])));
  return {engineBuild: digest(JSON.stringify(sourceHashes)), sourceHashes};
}

export async function assertSourceSnapshot(expected, root = process.cwd()) {
  const actual = await readSourceSnapshot(root);
  if(actual.engineBuild !== expected.engineBuild) {
    const paths = new Set([...Object.keys(expected.sourceHashes), ...Object.keys(actual.sourceHashes)]);
    const changed = [...paths].filter(path => expected.sourceHashes[path] !== actual.sourceHashes[path]);
    throw new Error('Source changed during verification/build: ' + changed.join(', '));
  }
}

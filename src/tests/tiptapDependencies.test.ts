// @vitest-environment node
import {existsSync, readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

type PackageManifest = {
  name: string,
  version: string,
  dependencies?: Record<string, string>,
  devDependencies?: Record<string, string>,
  optionalDependencies?: Record<string, string>,
  peerDependencies?: Record<string, string>
};

const root = resolve(__dirname, '../..');
const rootManifestPath = join(root, 'package.json');
const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf8')) as PackageManifest;
const directDependencies = {
  ...rootManifest.dependencies,
  ...rootManifest.devDependencies,
  ...rootManifest.optionalDependencies
};
const version = directDependencies['@tiptap/core'];
const isTiptap = (name: string) => name.startsWith('@tiptap/');

function readInstalledPackage(name: string, parent: string) {
  // @tiptap/pm exports subpaths only; none of these packages export package.json.
  const entry = createRequire(parent).resolve(name === '@tiptap/pm' ? `${name}/state` : name);
  let directory = dirname(realpathSync(entry));
  while(directory !== dirname(directory)) {
    const path = join(directory, 'package.json');
    if(existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as PackageManifest;
      if(manifest.name === name) return {manifest, path};
    }
    directory = dirname(directory);
  }
  throw new Error(`Missing installed manifest for ${name} from ${parent}`);
}

test('direct Tiptap dependencies use one exact release with an upstream audit', () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  for(const [name, declared] of Object.entries(directDependencies).filter(([name]) => isTiptap(name))) {
    expect(declared, name).toBe(version);
  }
  expect(existsSync(join(root, `scripts/tiptap-audit/tiptap-${version}.json`))).toBe(true);
});

test('every installed Tiptap dependency and peer resolves to the audited release', () => {
  const visited = new Set<string>();
  const mismatches: string[] = [];
  const visit = (name: string, parent: string) => {
    const {manifest, path} = readInstalledPackage(name, parent);
    if(visited.has(path)) return;
    visited.add(path);
    if(manifest.version !== version) mismatches.push(`${name}@${manifest.version} from ${parent}`);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies
    };
    for(const dependency of Object.keys(dependencies).filter(isTiptap)) visit(dependency, path);
  };
  Object.keys(directDependencies).filter(isTiptap).forEach(name => visit(name, rootManifestPath));
  expect(mismatches).toEqual([]);
});

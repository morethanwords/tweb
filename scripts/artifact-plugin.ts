import type {Plugin} from 'vite';
import {mkdirSync, writeFileSync} from 'node:fs';
import {relative} from 'node:path';
import {root} from './solid-aliases.ts';

export function artifactPlugin(kind: 'app' | 'worker' = 'app', directory = 'artifacts'): Plugin {
  const local = (id: string) => id.startsWith(root) ? relative(root, id) : id;
  return {
    name: `shell-module-evidence-${kind}`,
    generateBundle(_options, bundle) {
      const modules = [...this.getModuleIds()].map(local).sort();
      const chunks = Object.values(bundle).filter(item => item.type === 'chunk').map(item => ({
        file: '/' + item.fileName, entry: item.isEntry, facade: item.facadeModuleId ? local(item.facadeModuleId) : null,
        imports: item.imports.map(file => '/' + file), dynamicImports: item.dynamicImports.map(file => '/' + file),
        modules: Object.keys(item.modules).map(local).sort()
      }));
      mkdirSync(directory, {recursive: true});
      writeFileSync(`${directory}/${kind === 'app' ? 'modules' : 'worker-modules'}.json`, JSON.stringify(modules, null, 2) + '\n');
      writeFileSync(`${directory}/${kind === 'app' ? 'chunks' : 'worker-chunks'}.json`, JSON.stringify(chunks, null, 2) + '\n');
    }
  };
}

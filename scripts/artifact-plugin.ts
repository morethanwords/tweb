import type {Plugin} from 'vite';
import {mkdirSync, writeFileSync} from 'node:fs';
import {relative} from 'node:path';
import {root} from './solid-aliases.ts';

export function artifactPlugin(): Plugin {
  return {
    name: 'shell-module-evidence',
    generateBundle() {
      const modules = [...this.getModuleIds()].map(id => id.startsWith(root) ? relative(root, id) : id).sort();
      mkdirSync('artifacts', {recursive: true});
      writeFileSync('artifacts/modules.json', JSON.stringify(modules, null, 2) + '\n');
    }
  };
}

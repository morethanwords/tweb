import {spawnSync} from 'node:child_process';

if (!process.versions.node.startsWith('22.')) throw new Error('shell:verify requires pinned Node 22.');
const version = spawnSync('pnpm', ['--version'], {encoding: 'utf8'});
if (version.stdout.trim() !== '11.16.0') throw new Error('Use pnpm 11.16.0.');
for (const task of ['shell:typecheck', 'shell:lint', 'shell:unit', 'shell:build', 'shell:reference', 'shell:browser']) {
  const result = spawnSync('pnpm', ['run', task], {stdio: 'inherit'});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

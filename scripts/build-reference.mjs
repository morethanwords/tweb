import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createManifest} from './check-artifact.mjs';

const manifest = JSON.parse(await readFile('reference/upstream-manifest.json', 'utf8'));
const pin = '4a82cc7667477751cfc1b0dcec75db539c797a03';
if (manifest.commit !== pin) throw new Error('Unexpected upstream reference pin.');
for (const file of manifest.files) {
  const contents = await readFile(file.retainedPath);
  const actual = createHash('sha256').update(contents).digest('hex');
  if (actual !== file.sha256) throw new Error('Modified frozen reference: ' + file.retainedPath);
}
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'scripts/reference.config.ts'], {stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status ?? 1);
await createManifest('reference-dist', 'artifacts/reference-manifest.json', {checkModules: false});
console.log('Independent upstream reference verified and compiled.');

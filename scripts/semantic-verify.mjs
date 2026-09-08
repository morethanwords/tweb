import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {readSourceSnapshot,assertSourceSnapshot} from './source-snapshot.mjs';

if(process.versions.node!=='22.23.2')throw new Error('semantic:verify requires Node 22.23.2.');
const outcomes=[];
let source;
async function run(command,args) {
  const started=performance.now();
  const result=spawnSync(command,args,{stdio:'inherit',env:{...process.env,SHELL_BROWSER_WORKERS:process.env.SHELL_BROWSER_WORKERS??'2'}});
  outcomes.push({command:[command,...args],exitCode:result.status,elapsedMs:Math.round(performance.now()-started)});
  if(result.status!==0)process.exit(result.status??1);
  if(source)await assertSourceSnapshot(source);
}
// Remove an earlier success before starting; a failed attempt must not leave it current.
await rm('semantic-artifacts/verification.json',{force:true});
await run('node',['scripts/quickjs-assets.mjs']);
source=await readSourceSnapshot();
await run('pnpm',['run','shell:verify']);
await run('pnpm',['run','semantic:build']);
await run('pnpm',['run','semantic:browser']);
await run('node',['semantic-artifacts/measurement/semantic-measure.js']);
const builtSource=JSON.parse(await readFile('semantic-artifacts/source-manifest.json','utf8'));
if(builtSource.engineBuild!==source.engineBuild)throw new Error('Build does not match the tested source.');
const browserHash=createHash('sha256').update(await readFile('companion-dist/build-manifest.json')).digest('hex');
const runtimeHash=createHash('sha256').update(await readFile('semantic-dist/runtime-manifest.json')).digest('hex');
await mkdir('semantic-artifacts',{recursive:true});
await writeFile('semantic-artifacts/verification.json',JSON.stringify({outcome:'passed',engineBuild:source.engineBuild,browserHash,runtimeHash,lockHash:source.sourceHashes['pnpm-lock.yaml'],outcomes},null,2)+'\n');
console.log('semantic:verify passed',source.engineBuild);

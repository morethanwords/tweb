import {build} from 'vite';
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createManifest} from './check-artifact.mjs';
import {readSourceSnapshot, assertSourceSnapshot} from './source-snapshot.mjs';

const started=performance.now();
const digest=value=>createHash('sha256').update(value).digest('hex');
async function files(directory) {
  const found=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path=join(directory,entry.name);
    if(entry.isDirectory()) found.push(...await files(path)); else if(entry.isFile()) found.push(path);
  }
  return found;
}
const source=await readSourceSnapshot();
const {engineBuild,sourceHashes}=source;
await mkdir('semantic-artifacts',{recursive:true});
await writeFile('semantic-artifacts/source-manifest.json',JSON.stringify({engineBuild,sourceHashes},null,2)+'\n');
await build({configFile:'vite.companion.config.ts'});
await rename('companion-dist/companion.html','companion-dist/index.html');
const browser=await createManifest('companion-dist','companion-dist/build-manifest.json',{companion:true});
const banner='import {createRequire as __nodeCreateRequire} from "node:module"; import {fileURLToPath as __nodeFileURLToPath} from "node:url"; import {dirname as __nodeDirname} from "node:path"; const require = __nodeCreateRequire(import.meta.url); const __filename = __nodeFileURLToPath(import.meta.url); const __dirname = __nodeDirname(__filename);';
await build({configFile:false,ssr:{noExternal:true},build:{
  ssr:true,outDir:'semantic-dist',emptyOutDir:true,target:'node22',minify:false,sourcemap:false,
  rolldownOptions:{input:{'semantic-entry':resolve('scripts/semantic-entry.ts'),'semantic-code-worker':resolve('scripts/semantic-code-worker.ts')},output:{entryFileNames:'[name].js',chunkFileNames:'chunks/[name]-[hash].js',banner}}
}});
const runtimeFiles=await files('semantic-dist');
const runtime=await Promise.all(runtimeFiles.map(async path=>{const value=await readFile(path);return {path:path.slice('semantic-dist/'.length),bytes:value.length,sha256:digest(value)};}));
await writeFile('semantic-dist/runtime-manifest.json',JSON.stringify({schemaVersion:1,engineBuild,node:process.versions.node,files:runtime},null,2)+'\n');
await build({configFile:false,ssr:{noExternal:true},build:{ssr:resolve('scripts/semantic-measure.ts'),outDir:'semantic-artifacts/measurement',emptyOutDir:true,target:'node22',minify:false,sourcemap:false,rolldownOptions:{output:{entryFileNames:'semantic-measure.js',banner}}}});
await assertSourceSnapshot(source);
const measurement={engineBuild,buildMs:Math.round(performance.now()-started),browser:browser.gzip,runtimeBytes:runtime.reduce((sum,item)=>sum+item.bytes,0)};
await writeFile('semantic-artifacts/build.json',JSON.stringify(measurement,null,2)+'\n');
console.log('Companion artifact:',JSON.stringify(measurement));

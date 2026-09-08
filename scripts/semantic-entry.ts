import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createSemanticApp} from '../src/shell/semantic/app';
import {launchCompanion} from './semantic-server';
import {executeNodeCode,validateNodeCode} from './semantic-code-adapter';

const flags = new Map<string,string>();
for(let index=2;index<process.argv.length;index+=2) {
  const key=process.argv[index],value=process.argv[index+1];
  if(!['--port','--dir','--token-file'].includes(key)||!value||flags.has(key))throw new Error('Use --port, --dir or --token-file.');
  flags.set(key,value);
}
const manifest=JSON.parse(await readFile(new URL('./runtime-manifest.json',import.meta.url),'utf8')) as {engineBuild:string;node:string;files:{path:string;bytes:number;sha256:string}[]};
if(process.versions.node!==manifest.node)throw new Error('Runtime Node differs from the verified build.');
for(const file of manifest.files) {
  if(!/^(?:chunks\/)?[A-Za-z0-9_-]+\.js$/.test(file.path))throw new Error('Invalid runtime artifact path.');
  const body=await readFile(new URL('./'+file.path,import.meta.url));
  if(body.length!==file.bytes||createHash('sha256').update(body).digest('hex')!==file.sha256)throw new Error('Runtime artifact differs from its manifest.');
}
const app=createSemanticApp({engineBuild:manifest.engineBuild,
  executeCode:async(request,signal)=>{
    const reply=await executeNodeCode({...request,signal});
    if(reply.ok&&reply.result)return {ok:true,outcome:reply.result.outcome,data:reply.result.data??null};
    if(!reply.ok)return {ok:false,error:reply.error,infrastructure:reply.kind==='infrastructure_error'};
    return {ok:false,error:'CODE_RESULT_MISSING',infrastructure:true};
  },
  validateCode:async(request,signal)=>{
    const reply=await validateNodeCode({...request,signal});
    return {valid:reply.ok,infrastructure:!reply.ok&&reply.kind==='infrastructure_error',diagnostics:reply.diagnostics};
  }
});
await launchCompanion({app,
  artifactRoot:flags.has('--dir')?resolve(flags.get('--dir')!):fileURLToPath(new URL('../companion-dist/',import.meta.url)),
  tokenFile:flags.get('--token-file'),port:flags.has('--port')?Number(flags.get('--port')):3130
});

// tweb: builds dist/emscripten-module.asyncify.wasm, the QuickJS of dist/emscripten-module.wasm whose host calls can
// wait in engines without JavaScript Promise Integration (widget-sandbox host/suspend.ts, the `worker` transport).
// Only the import QuickJS calls host functions through may unwind; its minified name is read from the emscripten glue.
//
//   node src/vendor/widget-sandbox-quickjs/scripts/asyncify.mjs [path/to/wasm-opt]
//
// wasm-opt comes from binaryen (npm `binaryen`, 132); without an argument `npx binaryen@132` provides it.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dist');
const glue = fs.readFileSync(path.join(dist, 'emscripten-module.browser.mjs'), 'utf8');
// `var c={a:ra}` hands the import object to the instance; in it `t:function(...){return Module.callbacks.callFunction(...)}`
const moduleName = glue.match(/var c=\{(\w+):(\w+)\},d=Module\.instantiateWasm/);
if(!moduleName) throw new Error('the import object was not found in the emscripten glue');
const name = glue.match(/(?:^|[,{])(\w+):function\([\w,]*\)\{return Module\.callbacks\.callFunction\(/m);
if(!name) throw new Error('the host call import was not found in the emscripten glue');
const input = path.join(dist, 'emscripten-module.wasm');
const output = path.join(dist, 'emscripten-module.asyncify.wasm');
const args = [input, '--enable-bulk-memory', '--enable-nontrapping-float-to-int', '--enable-sign-ext', '--enable-mutable-globals',
  '--asyncify', `--pass-arg=asyncify-imports@${moduleName[1]}.${name[1]}`, '-Oz', '-o', output];
const wasmOpt = process.argv[2];
if(wasmOpt) execFileSync(wasmOpt, args, {stdio: 'inherit'});
else execFileSync('npx', ['--yes', '-p', 'binaryen@132', 'wasm-opt', ...args], {stdio: 'inherit'});
console.log(`${path.relative(process.cwd(), output)}: ${fs.statSync(output).size} bytes (asyncify-imports ${moduleName[1]}.${name[1]})`);

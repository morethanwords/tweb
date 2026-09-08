import {parentPort} from 'node:worker_threads';
import {compile} from '../src/shell/code/compiler';
import {validateRequest} from '../src/shell/code/contracts';
import {executeSandbox, SandboxInfrastructureError} from '../src/shell/code/sandbox';
import wasmBase64 from '../src/shell/code/generated/wasm';
import type {NodeCodeReply, NodeCodeWorkerRequest, NodeCodeWorkerResponse} from './semantic-code-adapter';

if(!parentPort) throw new Error('Code execution requires a worker thread.');
const port = parentPort;
// Exactly one message per worker. No guest state can survive between activations.
port.once('message', async ({id, action, request}: NodeCodeWorkerRequest) => {
  let reply: NodeCodeReply;
  try { validateRequest(request); }
  catch {
    port.postMessage({id, reply: {ok: false, kind: 'guest_error', code: 'INVALID_INPUT', error: 'Invalid Code input.', diagnostics: []}} satisfies NodeCodeWorkerResponse);
    return;
  }
  let compiled: ReturnType<typeof compile>;
  try { compiled = compile(request); }
  catch {
    port.postMessage({id, reply: {ok: false, kind: 'infrastructure_error', code: 'COMPILER_ERROR', error: 'Code compiler failed.', diagnostics: []}} satisfies NodeCodeWorkerResponse);
    return;
  }
  if(compiled.diagnostics.length) reply = {ok: false, kind: 'guest_error', code: 'COMPILE_ERROR', error: 'Исправьте ошибки TypeScript.', diagnostics: compiled.diagnostics};
  else if(action === 'validate') reply = {ok: true, diagnostics: []};
  else if(!compiled.javascript) reply = {ok: false, kind: 'infrastructure_error', code: 'COMPILER_EMPTY', error: 'Code compiler produced no output.', diagnostics: []};
  else {
    let module: WebAssembly.Module;
    try { module = await WebAssembly.compile(Uint8Array.from(Buffer.from(wasmBase64, 'base64'))); }
    catch {
      port.postMessage({id, reply: {ok: false, kind: 'infrastructure_error', code: 'WASM_INIT', error: 'Code runtime could not initialize.', diagnostics: []}} satisfies NodeCodeWorkerResponse);
      return;
    }
    try { reply = {ok: true, diagnostics: [], result: await executeSandbox(compiled.javascript, request, module)}; }
    catch(error) {
      reply = error instanceof SandboxInfrastructureError
        ? {ok: false, kind: 'infrastructure_error', code: 'SANDBOX_INIT', error: error.message, diagnostics: []}
        : {ok: false, kind: 'guest_error', code: 'EXECUTION_ERROR', error: error instanceof Error ? error.message.slice(0, 1000) : 'Code execution failed.', diagnostics: []};
    }
  }
  port.postMessage({id, reply} satisfies NodeCodeWorkerResponse);
});

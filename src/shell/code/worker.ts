import './worker-guard';
import wasmBase64 from './generated/wasm';
import type {WorkerRequest, WorkerReply, CodeReply} from './contracts';
const bytes = Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0));
const wasm = WebAssembly.compile(bytes);
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const {id, action, request} = event.data;
  let reply: CodeReply;
  try {
    // Keep shared runtime code out of the entry chunk: WebKit re-evaluates
    // a Worker entry if a dynamically loaded child imports that entry again.
    const {validateRequest} = await import('./contracts');
    validateRequest(request);
    const {compile} = await import('./compiler');
    const {javascript, diagnostics} = compile(request);
    if(diagnostics.length) reply = {ok: false, diagnostics, error: 'Исправьте ошибки TypeScript.'};
    else if(action === 'validate') reply = {ok: true, diagnostics: []};
    else if(!javascript) reply = {ok: false, diagnostics: [], error: 'TypeScript не сформировал код.'};
    else {
      const {executeSandbox} = await import('./sandbox');
      reply = {ok: true, diagnostics: [], result: await executeSandbox(javascript, request, await wasm)};
    }
  } catch(error) {reply = {ok: false, diagnostics: [], error: error instanceof Error ? error.message : 'Ошибка изолированного исполнения.'};}
  self.postMessage({id, reply} satisfies WorkerReply);
};

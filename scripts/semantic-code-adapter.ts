import {Worker} from 'node:worker_threads';
import {CodeLimits, validateRequest, type CodeDiagnostic, type CodeRequest, type CodeResult} from '../src/shell/code/contracts';

export type NodeCodeReply =
  | {ok: true; diagnostics: CodeDiagnostic[]; result?: CodeResult}
  | {ok: false; kind: 'guest_error' | 'infrastructure_error'; code: string; error: string; diagnostics: CodeDiagnostic[]};

export interface NodeCodeAdapterOptions {workerUrl?: URL}
export type NodeCodeAction = 'validate' | 'execute';
export interface NodeCodeWorkerRequest {id: number; action: NodeCodeAction; request: Omit<CodeRequest, 'signal'>}
export interface NodeCodeWorkerResponse {id: number; reply: NodeCodeReply}

function infrastructure(code: string, error: string): NodeCodeReply {
  return {ok: false, kind: 'infrastructure_error', code, error, diagnostics: []};
}

/** One active fresh worker. Rejection is explicit; there is no unbounded queue. */
export function createNodeCodeAdapter({workerUrl = new URL('./semantic-code-worker.js', import.meta.url)}: NodeCodeAdapterOptions = {}) {
  let active = false;
  let sequence = 0;
  return async function check(request: CodeRequest, action: NodeCodeAction = 'validate'): Promise<NodeCodeReply> {
    if(request.signal?.aborted) return infrastructure('ABORTED', 'Code request was cancelled.');
    if(active) return infrastructure('BUSY', 'Another Code operation is active.');
    const {signal, ...input} = request;
    try { validateRequest(input); }
    catch(error) {
      return {ok: false, kind: 'guest_error', code: 'INVALID_INPUT', error: error instanceof Error ? error.message : 'Invalid Code input.', diagnostics: []};
    }
    active = true;
    const id = ++sequence;
    return new Promise(resolve => {
      let worker: Worker | undefined;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (reply: NodeCodeReply): void => {
        if(settled) return;
        settled = true;
        if(timer) clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        // Do not release the single-worker slot until termination completes.
        const terminated = worker ? worker.terminate().catch(() => undefined) : Promise.resolve();
        void terminated.then(() => { active = false; resolve(reply); });
      };
      const abort = (): void => finish(infrastructure('ABORTED', 'Code request was cancelled.'));
      timer = setTimeout(() => finish(infrastructure('HOST_TIMEOUT', 'Code worker exceeded the 2 second host deadline.')), CodeLimits.hostKillMs);
      signal?.addEventListener('abort', abort, {once: true});
      if(signal?.aborted) { abort(); return; }
      try {
        worker = new Worker(workerUrl, {resourceLimits: {maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32, stackSizeMb: 4}, stdout: true, stderr: true});
        // Guest failures are returned as data; worker output must never reach server logs.
        worker.stdout?.resume(); worker.stderr?.resume();
        worker.once('error', () => finish(infrastructure('WORKER_ERROR', 'Code worker failed.')));
        worker.once('exit', () => {if(!settled) finish(infrastructure('WORKER_EXIT', 'Code worker exited before returning a result.'));});
        worker.on('message', (message: NodeCodeWorkerResponse) => {
          if(message?.id !== id) return;
          const reply = message.reply;
          if(!reply || typeof reply.ok !== 'boolean' || !Array.isArray(reply.diagnostics)) {
            finish(infrastructure('WORKER_PROTOCOL', 'Code worker returned an invalid response.')); return;
          }
          finish(reply);
        });
        worker.postMessage({id, action, request: input} satisfies NodeCodeWorkerRequest);
      } catch { finish(infrastructure('WORKER_START', 'Code worker could not start.')); }
    });
  };
}

export const checkNodeCode = createNodeCodeAdapter();
export const validateNodeCode = (request: CodeRequest): Promise<NodeCodeReply> => checkNodeCode(request, 'validate');
export const executeNodeCode = (request: CodeRequest): Promise<NodeCodeReply> => checkNodeCode(request, 'execute');

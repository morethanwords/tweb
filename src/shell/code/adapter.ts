import {CodeLimits, validateRequest, type CodeRequest, type CodeResult, type CodeReply, type WorkerReply} from './contracts';
export type {CodeRequest, CodeResult, CodeDiagnostic, VariableType} from './contracts';
let requestId = 0;
/** Workers are single-use: completion, abort and timeout all terminate the process. */
export function checkCode(request: CodeRequest, action: 'validate' | 'execute' = 'validate'): Promise<CodeReply> {
  return new Promise(resolve => {
    const {signal, ...data} = request;
    if(signal?.aborted) {resolve({ok: false, diagnostics: [], error: 'Проверка отменена.'}); return;}
    try {validateRequest(data);} catch(error) {resolve({ok: false, diagnostics: [], error: error instanceof Error ? error.message : 'Недопустимый код.'}); return;}
    let worker: Worker;
    try {worker = new Worker(new URL('./worker.ts', import.meta.url), {type: 'module'});} catch {resolve({ok: false, diagnostics: [], error: 'Браузер не разрешил запуск изолированного исполнителя.'}); return;}
    const id = ++requestId;
    let settled = false;
    const finish = (reply: CodeReply) => {
      if(settled) return;
      settled = true; clearTimeout(timer); worker.terminate(); signal?.removeEventListener('abort', abort); resolve(reply);
    };
    const abort = () => finish({ok: false, diagnostics: [], error: 'Проверка отменена.'});
    const timer = setTimeout(() => finish({ok: false, diagnostics: [], error: 'Исполнение остановлено: превышен лимит 2 секунды.'}), CodeLimits.hostKillMs);
    signal?.addEventListener('abort', abort, {once: true});
    worker.onmessage = (event: MessageEvent<WorkerReply | {kind: 'isolation-violation'; capability: string}>) => {
      if('kind' in event.data && event.data.kind === 'isolation-violation') {
        console.warn('__SHELL_ISOLATION__:' + JSON.stringify({capability: event.data.capability, worker: true}));
        finish({ok: false, diagnostics: [], error: 'Изолированный код запросил недоступную возможность.'});
      } else if('id' in event.data && event.data.id === id) finish(event.data.reply);
    };
    worker.onerror = event => {event.preventDefault(); finish({ok: false, diagnostics: [], error: 'Изолированный исполнитель завершился с ошибкой.'});};
    worker.onmessageerror = () => finish({ok: false, diagnostics: [], error: 'Не удалось прочитать результат исполнителя.'});
    try {worker.postMessage({id, action, request: data});} catch {finish({ok: false, diagnostics: [], error: 'Не удалось передать контекст исполнителю.'});}
  });
}
export async function executeCode(request: CodeRequest): Promise<CodeResult> {
  const reply = await checkCode(request, 'execute');
  if(!reply.ok) throw new Error(reply.diagnostics.length ? reply.diagnostics.map(item => `${item.line}:${item.column} ${item.message}`).join('\n') : reply.error);
  if(!reply.result) throw new Error('Код не вернул результат.');
  return reply.result;
}

import {createSignal} from 'solid-js';
import {command, createEditor} from './core/editor';
import {validateDocument} from './core/document';
import type {DocumentCommand, ShellDocument} from './core/types';
import type {BatchResult} from './semantic/contracts';

export interface ConfirmedDocument {
  document: ShellDocument; revision: string; revisionNumber: number; epoch: string; verification: unknown;
}
export interface CompanionState {
  status: 'ready' | 'saving' | 'conflict' | 'offline'; message: string;
  confirmed: ConfirmedDocument; pending: number; draftActive: boolean; testing: boolean;
  testResult: BatchResult | null; testRevision: string | null;
}
interface QueuedChange {kind: 'manual_change' | 'undo_change'; operations: DocumentCommand[]; body: unknown | null; uncertain: boolean}
interface BridgeOptions {fetch?: typeof fetch; requestKey?: () => string; timeoutMs?: number}
class ResponseError extends Error {
  constructor(readonly code: string, message: string, readonly definite = true) {super(message);}
}
function record(value: unknown): Record<string, unknown> | null {return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;}
export function parseConfirmed(value: unknown): ConfirmedDocument {
  const data = record(value);
  if(!data || typeof data.revision !== 'string' || !Number.isSafeInteger(data.revisionNumber) || typeof data.epoch !== 'string') throw new Error('Недопустимый ответ локального сервера.');
  return {document: validateDocument(data.document), revision: data.revision, revisionNumber: data.revisionNumber as number, epoch: data.epoch, verification: structuredClone(data.verification ?? null)};
}
function unwrap(value: unknown): unknown {
  const envelope = record(value);
  if(envelope?.ok === true) return envelope.data;
  const error = record(envelope?.error);
  throw new ResponseError(typeof error?.code === 'string' ? error.code : 'INVALID_RESPONSE', typeof error?.message === 'string' ? error.message : 'Сервер не подтвердил изменение.');
}

/** Confirmed server document is authoritative. Only typed operations may cross the write boundary. */
export function createCompanionBridge(initial: ConfirmedDocument, csrfToken: string, options: BridgeOptions = {}) {
  initial = parseConfirmed(initial);
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  const requestKey = options.requestKey ?? (() => crypto.randomUUID());
  const [state, setState] = createSignal<CompanionState>({status: 'ready', message: '', confirmed: initial, pending: 0, draftActive: false, testing: false, testResult: null, testRevision: null});
  const listeners = new Set<(snapshot: ConfirmedDocument) => void>();
  const controllers = new Set<AbortController>();
  let queue: QueuedChange[] = [], disposed = false, sending = false, polling = false;
  let intentVersion = 0;
  let remote: ConfirmedDocument | null = null, timer: ReturnType<typeof setTimeout> | undefined;
  let stopPolling: (() => void) | null = null;
  function update(patch: Partial<CompanionState>) {if(!disposed) setState(previous => ({...previous, ...patch, pending: queue.length}));}
  function publish(snapshot: ConfirmedDocument) {
    if(disposed) return;
    for(const listener of listeners) listener(structuredClone(snapshot));
  }
  async function json(path: string, body?: unknown, renewSession = true): Promise<unknown> {
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await request(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? undefined : {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken},
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal});
      let data: unknown;
      try {data = await response.json();} catch {throw new ResponseError('INVALID_RESPONSE', 'Сервер вернул неполный ответ.', false);}
      if(!response.ok) {
        const error = record(record(data)?.error);
        if(renewSession && path !== '/api/session' && (error?.code === 'SESSION_REQUIRED' || error?.code === 'CSRF_DENIED')) {
          const session = record(await json('/api/session', undefined, false));
          if(typeof session?.csrfToken !== 'string') throw new ResponseError('INVALID_SESSION', 'Не удалось восстановить локальную сессию.');
          csrfToken = session.csrfToken;
          return await json(path, body, false);
        }
        throw new ResponseError(typeof error?.code === 'string' ? error.code : `HTTP_${response.status}`, typeof error?.message === 'string' ? error.message : 'Локальный сервер недоступен.', response.status < 500);
      }
      return data;
    } finally {clearTimeout(timeout); controllers.delete(controller);}
  }
  async function fetchDocument() {return parseConfirmed(unwrap(await json('/api/document')));}
  function conflict(snapshot: ConfirmedDocument) {
    remote = snapshot;
    update({status: 'conflict', message: 'Сценарий изменился в другом окне. Ваша правка остаётся здесь.'});
  }
  async function refresh() {
    if(disposed || polling || sending) return;
    polling = true;
    const startedEpoch = state().confirmed.epoch;
    try {
      const snapshot = await fetchDocument();
      if(disposed || sending) return;
      if(startedEpoch !== state().confirmed.epoch || snapshot.epoch === state().confirmed.epoch && snapshot.revisionNumber < state().confirmed.revisionNumber) return;
      const changed = snapshot.revision !== state().confirmed.revision || snapshot.epoch !== state().confirmed.epoch;
      if(changed && (state().draftActive || queue.length || state().status === 'conflict')) conflict(snapshot);
      else {
        update({confirmed: snapshot, ...(queue.length || state().status === 'conflict' ? {} : {status: 'ready', message: ''})});
        if(changed) publish(snapshot);
      }
    } catch(error) {if(!disposed && state().status !== 'conflict') update({status: 'offline', message: error instanceof Error ? error.message : 'Нет связи с локальным сервером.'});}
    finally {polling = false;}
  }
  async function pump() {
    if(disposed || sending || state().status === 'conflict' || state().status === 'offline' || !queue.length) return;
    sending = true; update({status: 'saving', message: ''});
    const job = queue[0];
    if(job.body === null) job.body = {name: job.kind, args: {botId: state().confirmed.document.id, baseRevision: state().confirmed.revision, requestKey: requestKey(), ...(job.kind === 'manual_change' ? {operations: job.operations} : {})}};
    try {
      const receipt = record(unwrap(await json('/api/command', job.body)));
      // The commit receipt is not a document. A separate read obtains the authoritative projection.
      const snapshot = await fetchDocument();
      if(disposed) return;
      queue.shift();
      const advancedRemotely = receipt?.revision !== snapshot.revision || snapshot.epoch !== state().confirmed.epoch;
      if(advancedRemotely && (queue.length || state().draftActive)) {conflict(snapshot); return;}
      remote = null;
      update({confirmed: snapshot, status: queue.length ? 'saving' : 'ready', message: ''});
      if(!queue.length && !state().draftActive) publish(snapshot);
    } catch(error) {
      if(disposed) return;
      job.uncertain = !(error instanceof ResponseError) || !error.definite;
      if(error instanceof ResponseError && /(?:CONFLICT|STALE|REVISION)/.test(error.code)) {
        try {conflict(await fetchDocument());} catch {update({status: 'conflict', message: 'Версия сценария изменилась. Правка сохранена в этом окне.'});}
      } else update({status: job.uncertain ? 'offline' : 'conflict', message: error instanceof Error ? error.message : 'Изменение не подтверждено.'});
    } finally {
      sending = false;
      if(!disposed && state().status !== 'conflict' && state().status !== 'offline' && queue.length) void pump();
    }
  }
  function change(operations: DocumentCommand[]) {
    if(disposed || !operations.length) return;
    intentVersion++;
    queue.push({kind: 'manual_change', operations: structuredClone(operations), body: null, uncertain: false});
    update({}); void pump();
  }
  function undo() {
    if(disposed) return;
    intentVersion++;
    queue.push({kind: 'undo_change', operations: [], body: null, uncertain: false}); update({}); void pump();
  }
  function setDraftActive(active: boolean) {
    if(active === state().draftActive) return;
    intentVersion++;
    update({draftActive: active});
    // Ending a draft does not silently accept a competing document.
    if(!active && !queue.length && state().status === 'ready') publish(state().confirmed);
  }
  async function retry() {
    if(disposed || sending || state().draftActive) return;
    const capturedIntent = ++intentVersion;
    if(queue[0]?.uncertain) {update({status: 'ready', message: ''}); void pump(); return;}
    try {
      const latest = remote ?? await fetchDocument();
      if(disposed || sending || capturedIntent !== intentVersion) return;
      // Explicit retry validates all captured intents against the newly confirmed document.
      let preview = createEditor(latest.document);
      for(const job of queue) {
        if(job.kind === 'undo_change') throw new Error('Повтор отмены после чужой правки недоступен. Откройте актуальный сценарий.');
        for(const operation of job.operations) {
          preview = command(preview, operation, preview.revision);
          if(preview.error) throw new Error(preview.error);
        }
        job.body = null;
      }
      remote = null; update({confirmed: latest, status: 'ready', message: ''});
      if(queue.length) void pump(); else publish(latest);
    } catch(error) {if(capturedIntent === intentVersion) update({status: 'conflict', message: error instanceof Error ? error.message : 'Не удалось повторить правку.'});}
  }
  async function discard() {
    if(disposed || sending) return;
    const capturedIntent = ++intentVersion;
    try {
      const latest = await fetchDocument();
      if(disposed || sending || capturedIntent !== intentVersion) return;
      queue = []; remote = null; update({confirmed: latest, status: 'ready', message: '', draftActive: false}); publish(latest);
    } catch(error) {if(capturedIntent === intentVersion) update({status: 'offline', message: error instanceof Error ? error.message : 'Не удалось получить сценарий.'});}
  }
  async function test() {
    if(disposed || state().testing || queue.length || state().draftActive || state().status !== 'ready') return;
    const captured = state().confirmed; update({testing: true});
    try {
      const result = unwrap(await json('/api/command', {name: 'bot_test', args: {mode: 'run', botId: captured.document.id,
        target: {kind: 'revision', revision: captured.revision}, requestKey: requestKey(), source: {kind: 'required_suite', caseIds: null}}})) as BatchResult;
      if(!record(result) || !Array.isArray(result.cases)) throw new Error('Сервер не вернул результаты сценариев.');
      update({testResult: result, testRevision: captured.revision}); await refresh();
    } catch(error) {update({message: error instanceof Error ? error.message : 'Не удалось проверить сценарии.'});}
    finally {update({testing: false});}
  }
  async function explain(reportId: string, offset = 0, detail?: {kind: 'assertion' | 'receipt' | 'observation'; index: number; offset: number}): Promise<unknown> {
    return unwrap(await json('/api/command', {name: 'execution_explain', args: {kind: 'simulation', reportId, offset, limit: 20, ...(detail ? {detail} : {})}}));
  }
  function startPolling() {
    if(stopPolling || disposed) return;
    const tick = () => {if(globalThis.document?.visibilityState !== 'hidden') void refresh(); timer = setTimeout(tick, 1000);};
    const focus = () => {void refresh();};
    globalThis.window?.addEventListener('focus', focus); globalThis.document?.addEventListener('visibilitychange', focus);
    timer = setTimeout(tick, 1000);
    stopPolling = () => {clearTimeout(timer); globalThis.window?.removeEventListener('focus', focus); globalThis.document?.removeEventListener('visibilitychange', focus);};
  }
  function dispose() {disposed = true; stopPolling?.(); for(const controller of controllers) controller.abort(); listeners.clear();}
  return {initial, state, change, undo, setDraftActive, refresh, retry, discard, test, explain, startPolling, dispose,
    subscribeDocument(listener: (snapshot: ConfirmedDocument) => void) {listeners.add(listener); return () => {listeners.delete(listener);};}};
}
export type CompanionBridge = ReturnType<typeof createCompanionBridge>;

export async function connectCompanion(fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): Promise<CompanionBridge> {
  const sessionResponse = await fetcher('/api/session', {credentials: 'same-origin', cache: 'no-store'});
  const session = record(await sessionResponse.json());
  if(!sessionResponse.ok || typeof session?.csrfToken !== 'string') throw new Error('Не удалось открыть локальную сессию.');
  const response = await fetcher('/api/document', {credentials: 'same-origin', cache: 'no-store'});
  if(!response.ok) throw new Error('Не удалось получить сценарий.');
  return createCompanionBridge(parseConfirmed(unwrap(await response.json())), session.csrfToken, {fetch: fetcher});
}

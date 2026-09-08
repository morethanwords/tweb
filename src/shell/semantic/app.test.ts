import {afterEach, describe, expect, it, vi} from 'vitest';
import {z} from 'zod';
import {createSemanticApp, type AppOptions} from './app';
import {createBlogSuite, createDefaultDocument, expectMessage} from './fixtures';
import {applyOperations} from './operations';
import {DomainError, hash, SemanticLimits} from './common';
import {OperationRegistry} from './registry';
import type {DocumentCommand} from '../core/types';
import type {Principal} from './contracts';

type App = ReturnType<typeof createSemanticApp>;
type Envelope<T> = {ok: true; data: T} | {ok: false; error: {code: string; message: string; details: unknown}};
interface PreparedView {changeId: string; state: string; candidateHash: string; tests: {outcome: string; complete: boolean}[]; reason: string | null; operationId: string}
const patch = (text: string): DocumentCommand[] => [{type: 'set_message_text', stepId: 'start', messageId: 'start-message', text}];
const defaults: AppOptions = {
  epoch: 'integration-epoch', engineBuild: 'test-engine-build',
  executeCode: async () => ({ok: true, outcome: 'ok', data: null}),
  validateCode: async () => ({valid: true, infrastructure: false, diagnostics: []})
};
const makeApp = (options: Partial<AppOptions> = {}): App => createSemanticApp({...defaults, ...options});
function success<T>(result: unknown): T {
  expect(result).toMatchObject({ok: true});
  return (result as {ok: true; data: T}).data;
}
function failure(result: unknown, code: string): void {expect(result).toMatchObject({ok: false, error: {code}});}
async function call(app: App, name: string, args: unknown, actor = app.principal, signal = new AbortController().signal): Promise<unknown> {
  const result = await app.handle(name, args, actor, signal);
  const definition = app.tools.find(item => item.name === name);
  if(definition) expect(definition.outputSchema.safeParse(result).success, `${name} must return its declared output schema`).toBe(true);
  return result;
}
function mutation(app: App, requestKey: string, operations = patch('Обновлённый бот')) {
  return {botId: app.documents.document.id, baseRevision: app.documents.revision, requestKey, operations};
}
async function prepare(app: App, requestKey = 'prepare', operations = patch('Обновлённый бот')): Promise<PreparedView> {
  return success<PreparedView>(await call(app, 'bot_prepare_change', mutation(app, requestKey, operations)));
}
afterEach(() => {vi.restoreAllMocks();vi.useRealTimers();});

describe('app, document store and receipt integration', () => {
  it('prepares all frozen required paths, applies exactly once and exposes the same document to the UI', async () => {
    const app = makeApp(), before = hash(app.documents.document), baseRevision = app.documents.revision;
    const context = success<{botId: string; revision: string; requiredSuite: {cases: unknown[]}}>(await call(app, 'bot_context', {}));
    expect(context.requiredSuite.cases).toHaveLength(5);
    expect(context).toMatchObject({capabilities:{testing:{wholeRunInvariants:'initial_run_only',continuationInvariants:'segment'}}});
    const change = await prepare(app);
    expect(change.state).toBe('ready'); expect(change.tests).toHaveLength(5);
    expect(change.tests.every(test => test.complete && test.outcome === 'passed')).toBe(true);
    expect(hash(app.documents.document)).toBe(before); expect(app.documents.revision).toBe(baseRevision);
    const apply = {botId: context.botId, baseRevision, changeId: change.changeId, requestKey: 'apply'};
    const first = await call(app, 'bot_apply_change', apply);
    const receipt = success<{revision: string; changed: boolean; candidateHash: string}>(first);
    expect(receipt.changed).toBe(true); expect(receipt.candidateHash).toBe(change.candidateHash);
    expect(await call(app, 'bot_apply_change', apply)).toEqual(first);
    expect(app.documents.revisionNumber).toBe(1);
    const snapshot = success<{document: App['documents']['document']; revision: string; verification: {outcome: string}}>(await call(app, 'document_snapshot', {}));
    expect(snapshot.document.content.messages['start-message']).toBe('Обновлённый бот');
    expect(snapshot.revision).toBe(receipt.revision); expect(snapshot.verification.outcome).toBe('passed');
  });

  it('rejects a reused key with different operations without touching Draft', async () => {
    const app = makeApp();
    const first = mutation(app, 'manual-key', patch('First'));
    success(await call(app, 'manual_change', first));
    const documentHash = hash(app.documents.document);
    failure(await call(app, 'manual_change', {...first, operations: patch('Second')}), 'IDEMPOTENCY_KEY_REUSED');
    expect(hash(app.documents.document)).toBe(documentHash); expect(app.documents.revisionNumber).toBe(1);
    expect(await call(app, 'manual_change', first)).toMatchObject({ok: true, data: {revisionNumber: 1}});
  });

  it('replays an old committed receipt after later edits without reverting them', async () => {
    const app = makeApp();
    const first = mutation(app, 'first', patch('First'));
    const receipt = await call(app, 'manual_change', first);
    success(await call(app, 'manual_change', mutation(app, 'second', patch('Second'))));
    expect(await call(app, 'manual_change', first)).toEqual(receipt);
    expect(app.documents.document.content.messages['start-message']).toBe('Second');
    expect(app.documents.revisionNumber).toBe(2);
  });

  it('accepts one of two simultaneous edits at one revision and rejects the loser atomically', async () => {
    const app = makeApp();
    const first = mutation(app, 'first', patch('First')), second = mutation(app, 'second', patch('Second'));
    const result = await Promise.all([call(app, 'manual_change', first), call(app, 'manual_change', second)]);
    expect(result.filter(value => (value as Envelope<unknown>).ok)).toHaveLength(1);
    expect(result.filter(value => !(value as Envelope<unknown>).ok)).toHaveLength(1);
    failure(result[1], 'REVISION_CONFLICT');
    expect(app.documents.revisionNumber).toBe(1);
    expect(app.documents.document.content.messages['start-message']).toBe('First');
  });

  it('keeps a candidate stale after manual edit and undo restore the same content', async () => {
    const app = makeApp(), baseline = hash(app.documents.document);
    const change = await prepare(app);
    const oldRevision = app.documents.revision;
    success(await call(app, 'manual_change', mutation(app, 'manual', patch('Temporary'))));
    success(await call(app, 'undo_change', {botId: app.documents.document.id, baseRevision: app.documents.revision, requestKey: 'undo'}));
    expect(hash(app.documents.document)).toBe(baseline); expect(app.documents.revisionNumber).toBe(2);
    expect(app.documents.state(app.documents.getChange(change.changeId, app.principal))).toBe('stale');
    failure(await call(app, 'bot_apply_change', {botId: app.documents.document.id, baseRevision: oldRevision, requestKey: 'apply-stale', changeId: change.changeId}), 'REVISION_CONFLICT');
    expect(hash(app.documents.document)).toBe(baseline);
  });

  it('never applies a candidate whose required path broke', async () => {
    const app = makeApp();
    const change = await prepare(app, 'break-route', [{type: 'set_button_transition', buttonId: 'start-offer', transition: null}]);
    expect(change.state).toBe('blocked'); expect(change.tests.some(test => test.outcome !== 'passed')).toBe(true);
    failure(await call(app, 'bot_apply_change', {botId: app.documents.document.id, baseRevision: app.documents.revision, requestKey: 'apply-broken', changeId: change.changeId}), 'CHANGE_NOT_READY');
    expect(app.documents.revisionNumber).toBe(0);
  });

  it('does not manufacture required tests for an unconfigured imported document', async () => {
    const app = makeApp({document: createDefaultDocument()});
    const change = await prepare(app);
    expect(change.state).toBe('blocked'); expect(change.reason).toBe('TESTS_NOT_CONFIGURED'); expect(change.tests).toHaveLength(0);
  });

  it('freezes the required suite and rejects certificates from other candidates or test contracts', async () => {
    const suite = createBlogSuite(), app = makeApp({suite});
    const original = app.documents.contract().hash;
    suite.cases[0].expect = []; app.documents.requiredSuite.cases[0].expect = [];
    expect(app.documents.contract().hash).toBe(original);
    const first = await prepare(app, 'first', patch('A')), second = await prepare(app, 'second', patch('B'));
    const a = app.documents.getChange(first.changeId, app.principal), b = app.documents.getChange(second.changeId, app.principal);
    const certificate = Object.values(a.certificates)[0];
    expect(() => app.documents.certificate(b, certificate)).toThrow('CERTIFICATE_MISMATCH');
    expect(() => app.documents.certificate(a, {...certificate, testContractHash: 'other-suite'})).toThrow('CERTIFICATE_MISMATCH');
    expect(() => app.documents.certificate(a, {...certificate, origin: 'ad_hoc'})).toThrow('CERTIFICATE_MISMATCH');
    expect(app.documents.state(a)).toBe('ready');
  });

  it('rejects required suites that only prove absence', () => {
    const suite = createBlogSuite();
    suite.cases = [{...suite.cases[0], expect: [expectMessage('nothing', 'start-message', 0, 0)]}];
    expect(() => makeApp({suite})).toThrow('INVALID_REQUIRED_SUITE');
  });

  it('preserves an expired prepare receipt without creating a new candidate on retry', async () => {
    let now = 1000;
    const app = makeApp({now: () => now}), args = mutation(app, 'prepare-key');
    const response = await call(app, 'bot_prepare_change', args), change = success<PreparedView>(response);
    now += SemanticLimits.idleMs;
    expect(await call(app, 'bot_prepare_change', args)).toEqual(response);
    failure(await call(app, 'bot_apply_change', {botId: app.documents.document.id, baseRevision: app.documents.revision, requestKey: 'expired-apply', changeId: change.changeId}), 'CHANGE_EXPIRED');
    expect(app.documents.revisionNumber).toBe(0);
  });

  it('checks owner/bot scope and rejects handles from a restarted companion', async () => {
    const app = makeApp(), change = await prepare(app);
    const noBot: Principal = {...app.principal, botIds: []};
    failure(await call(app, 'bot_context', {}, noBot), 'FORBIDDEN');
    failure(await call(app, 'bot_apply_change', {botId: app.documents.document.id, baseRevision: app.documents.revision, requestKey: 'forbidden', changeId: change.changeId}, {...app.principal, scopes: ['bot:read']}), 'FORBIDDEN');
    failure(await call(app, 'bot_inspect', {botId: app.documents.document.id, changeId: change.changeId}, {...app.principal, id: 'another-owner'}), 'NOT_FOUND');
    const restarted = makeApp({epoch: 'new-instance'});
    failure(await call(restarted, 'bot_validate', {botId: restarted.documents.document.id, target: {kind: 'revision', revision: app.documents.revision}}), 'INSTANCE_EXPIRED');
  });

  it('does not expose partial manual operations when a later operation fails', async () => {
    const app = makeApp(), before = hash(app.documents.document);
    const operations: DocumentCommand[] = [...patch('Must not leak'), {type: 'set_button_transition', buttonId: 'start-menu', transition: {type: 'screen', screenId: 'missing'}}];
    expect(await call(app, 'manual_change', mutation(app, 'invalid-batch', operations))).toMatchObject({ok: false});
    expect(hash(app.documents.document)).toBe(before); expect(app.documents.revisionNumber).toBe(0);
  });

  it('checks receipt capacity before changing the document', async () => {
    const app = makeApp(), before = hash(app.documents.document);
    vi.spyOn(app.registry, 'checkCommit').mockImplementation(() => {throw new DomainError('RECEIPT_LIMIT');});
    failure(await call(app, 'manual_change', mutation(app, 'full-receipts')), 'RECEIPT_LIMIT');
    expect(hash(app.documents.document)).toBe(before); expect(app.documents.revisionNumber).toBe(0);
  });

  it('validates apply response before commit when its DTO contract is broken', async () => {
    const app = makeApp(), change = await prepare(app), before = hash(app.documents.document);
    const definition = app.tools.find(tool => tool.name === 'bot_apply_change')!, original = definition.outputSchema;
    definition.outputSchema = z.strictObject({ok: z.literal(false), error: z.json()});
    try {
      const response = await app.handle('bot_apply_change', {botId: app.documents.document.id, baseRevision: app.documents.revision, requestKey: 'bad-output-contract', changeId: change.changeId}, app.principal, new AbortController().signal);
      expect(response).toMatchObject({ok: false});
      expect(hash(app.documents.document)).toBe(before); expect(app.documents.revisionNumber).toBe(0);
    } finally {definition.outputSchema = original;}
  });
});

describe('pending operations and cancellation', () => {
  function codeDocument() {
    return applyOperations(createDefaultDocument(), [{type: 'add_block', stepId: 'start', afterBlockId: null, messageText: null,
      block: {id: 'before-start-code', type: 'code', name: 'Code', source: 'export default function run(ctx: RoboContext) { return {outcome: "ok"}; }',
        outcomes: [{id: 'code-ok', name: 'ok', transition: {type: 'continue'}}], resultVariableId: null}}]).document;
  }

  it('bounds read-only Code validation at the domain deadline even if the compiler never settles', async () => {
    vi.useFakeTimers();
    let compilerSignal:AbortSignal|undefined;
    const app=makeApp({document:codeDocument(),validateCode:async (_request,signal)=>{compilerSignal=signal;return await new Promise(()=>{});}});
    let response:unknown;
    const pending=call(app,'bot_validate',{botId:app.documents.document.id,target:{kind:'revision',revision:null}}).then(value=>{response=value;});
    await vi.advanceTimersByTimeAsync(SemanticLimits.workMs);
    expect(response).toMatchObject({ok:false,error:{code:'DEADLINE_EXCEEDED'}});
    expect(compilerSignal?.aborted).toBe(true);
    expect(app.registry.retainedBytes()).toBe(0);
    expect(app.documents.revisionNumber).toBe(0);
    await pending;
  });

  it('returns the same deadline identity for the first prepare and its retry', async () => {
    vi.useFakeTimers();
    const app=makeApp({document:codeDocument(),validateCode:async (_request,signal)=>{
      await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
      return {valid:true,infrastructure:false,diagnostics:[]};
    }});
    const args=mutation(app,'deadline-prepare'),pending=call(app,'bot_prepare_change',args);
    await vi.advanceTimersByTimeAsync(SemanticLimits.workMs);
    const first=await pending;
    failure(first,'DEADLINE_EXCEEDED');
    expect(await call(app,'bot_prepare_change',args)).toEqual(first);
    expect(app.documents.revisionNumber).toBe(0);
  });

  it('rejects new registry allocations at the aggregate retained limit', async () => {
    const app=makeApp(),before=hash(app.documents.document);
    vi.spyOn(app.documents,'retainedBytes').mockReturnValue(SemanticLimits.retainedBytes);
    failure(await call(app,'bot_prepare_change',mutation(app,'aggregate-full')),'RESOURCE_LIMIT');
    expect(app.registry.retainedBytes()).toBe(0);
    expect(hash(app.documents.document)).toBe(before);
  });

  it('returns one pending operation for concurrent retries and cancellation cannot commit it later', async () => {
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>(resolve => {release = resolve;}), began = new Promise<void>(resolve => {started = resolve;});
    const validator = vi.fn(async () => {started(); await waiting; return {valid: true, infrastructure: false, diagnostics: []};});
    const app = makeApp({document: codeDocument(), suite: createBlogSuite(), validateCode: validator});
    const args = mutation(app, 'pending-prepare'), before = hash(app.documents.document);
    const first = call(app, 'bot_prepare_change', args);
    await began;
    const retry = success<{operationId: string; executionStatus: string}>(await call(app, 'bot_prepare_change', args));
    expect(retry.executionStatus).toBe('running'); expect(validator).toHaveBeenCalledTimes(1);
    success(await call(app, 'bot_test', {mode: 'cancel', operationId: retry.operationId}));
    release();
    failure(await first, 'CANCELLED');
    failure(await call(app, 'bot_prepare_change', args), 'CANCELLED');
    expect(hash(app.documents.document)).toBe(before); expect(app.documents.revisionNumber).toBe(0);
  });

  it('leaves a pending candidate stale when the UI commits a newer document', async () => {
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>(resolve => {release = resolve;}), began = new Promise<void>(resolve => {started = resolve;});
    const app = makeApp({document: codeDocument(), suite: createBlogSuite(), validateCode: async () => {started(); await waiting; return {valid: true, infrastructure: false, diagnostics: []};}});
    const pending = call(app, 'bot_prepare_change', mutation(app, 'pending'));
    await began;
    success(await call(app, 'manual_change', mutation(app, 'ui-change', patch('UI wins'))));
    release();
    const change = success<PreparedView>(await pending);
    expect(change.state).toBe('stale'); expect(app.documents.document.content.messages['start-message']).toBe('UI wins');
  });

  it('treats validator infrastructure failure as an invocation failure, never certification', async () => {
    const app = makeApp({document: codeDocument(), suite: createBlogSuite(), validateCode: async () => ({valid: false, infrastructure: true, diagnostics: []})});
    failure(await call(app, 'bot_prepare_change', mutation(app, 'runtime-down')), 'CODE_INFRASTRUCTURE');
    expect(app.documents.revisionNumber).toBe(0);
  });
});

describe('operation registry retention', () => {
  it('retains immutable receipts and denies new work at capacity without eviction', () => {
    const registry = new OperationRegistry('epoch'), actor: Principal = {id: 'owner', botIds: ['bot'], scopes: []};
    const claim = registry.claim(actor, 'bot', 'manual_change', 'key', {value: 1});
    registry.commit(claim.operation, {nested: {value: 2}});
    const replay = registry.replay(claim.operation) as {nested: {value: number}};
    replay.nested.value = 3;
    expect(registry.replay(claim.operation)).toEqual({nested: {value: 2}});
    vi.spyOn(registry, 'retainedBytes').mockReturnValue(SemanticLimits.receiptBytes);
    expect(() => registry.claim(actor, 'bot', 'manual_change', 'new-key', {value: 1})).toThrow('RECEIPT_LIMIT');
    expect(registry.claim(actor, 'bot', 'manual_change', 'key', {value: 1}).fresh).toBe(false);
    expect(registry.replay(claim.operation)).toEqual({nested: {value: 2}});
  });

  it('cannot commit an aborted operation or cancel a completed receipt', () => {
    const registry = new OperationRegistry('epoch'), actor: Principal = {id: 'owner', botIds: ['bot'], scopes: []};
    const first = registry.claim(actor, 'bot', 'apply', 'one', {}).operation;
    registry.cancel(first.id, actor);
    expect(() => registry.commit(first, {})).toThrow('CANCELLED');
    const second = registry.claim(actor, 'bot', 'apply', 'two', {}).operation;
    registry.commit(second, {revision: 'r1'});
    expect(registry.cancel(second.id, actor)).toEqual({operationId: second.id, executionStatus: 'committed'});
    expect(registry.replay(second)).toEqual({revision: 'r1'});
  });
  it('reserves terminal error space when a pending claim fills the retained budget',()=>{
    const registry=new OperationRegistry('epoch'),actor:Principal={id:'owner',botIds:['bot'],scopes:[]};
    const operation=registry.claim(actor,'bot','prepare','key',{}).operation,before=registry.retainedBytes();
    registry.reject(operation,'DEADLINE_EXCEEDED');
    expect(registry.retainedBytes()).toBe(before);
    expect(()=>registry.replay(operation)).toThrow('DEADLINE_EXCEEDED');
  });
});

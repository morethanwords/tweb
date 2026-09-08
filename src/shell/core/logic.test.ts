import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {serializeDocument, validateDocument} from './document';
import {deletionReason} from './editor';
import {documentTransitions, stepSummary} from './navigation';
import {activate, activationReadiness, advanceRun, answerChoice, completeCode, dispatchRunEvent, finishReply, messageText, resumeRun, retryFailed, sendText, startRun} from './simulator';
import {codeContext, defaultTestSeed, validateTestSeed} from './values';
import {ShellLimits, type ActionBlock, type Block, type CodeBlock, type JsonValue, type ShellDocument, type TestRun, type Transition, type WaitBlock} from './types';

const next: Transition = {type: 'continue'};
const screen = (screenId: string): Transition => ({type: 'screen', screenId});
const literal = (value: JsonValue) => ({type: 'literal' as const, value});
const message = (id: string): Block => ({id, type: 'message', messageId: id});
const action = (id: string, operation: ActionBlock['action'], success: Transition = next): ActionBlock => ({id, type: 'action', action: operation, success, error: null});
const code = (success: Transition = next): CodeBlock => ({id: 'calculate', type: 'code', name: 'Расчёт', source: 'export default async function run(ctx) { return { outcome: "paid", data: { balance: ctx.user.balance } }; }', outcomes: [{id: 'paid-outcome', name: 'paid', transition: success}], resultVariableId: 'run.result'});

function setScreen(document: ShellDocument, stepId: string, blocks: Block[], texts: Record<string, string> = {}): void {
  for(const id of document.steps[stepId].blockIds) {
    const block = document.blocks[id];
    if(block.type === 'message' || block.type === 'ask') {
      for(const id of document.messages[block.messageId].rows.flatMap(row => row.buttonIds)) {delete document.buttons[id]; delete document.content.buttons[id];}
      delete document.messages[block.messageId]; delete document.content.messages[block.messageId];
    }
    delete document.blocks[id];
  }
  document.steps[stepId].blockIds = blocks.map(block => block.id);
  for(const block of blocks) {
    document.blocks[block.id] = block;
    if(block.type === 'message' || block.type === 'ask') {
      document.messages[block.messageId] = {rows: []};
      document.content.messages[block.messageId] = texts[block.messageId] ?? block.messageId;
    }
  }
}
function button(document: ShellDocument, messageId: string, id: string, transition: Transition): void {
  document.messages[messageId].rows.push({id: `${id}-row`, buttonIds: [id]});
  document.buttons[id] = {transition, color: 'default'}; document.content.buttons[id] = id;
}
function finish(run: TestRun): TestRun {
  if(run.pending?.kind !== 'step') throw new Error('Expected typing reply');
  return finishReply(run, run.id, run.pending.id, run.pending.dueAt)!;
}
function full(run: TestRun, count: number): TestRun {
  return {...run, messages: [...run.messages, ...Array.from({length: count - run.messages.length}, (_, index) => ({id: `padding-${index}`, kind: 'text' as const, stepId: run.cursor.stepId, clientMessageId: `padding-${index}`, text: 'earlier', at: run.now}))]};
}

describe('sequential local logic invariants', () => {
  it('gates balance mutation behind Continue, applies once and preserves historical interpolation and seed', () => {
    const document = createFixture();
    setScreen(document, 'start', [message('before'), action('charge', {type: 'increment', variableId: 'user.balance', amount: -1000}), message('after')], {before: 'До: {{user.balance}}', after: 'После: {{user.balance}}'});
    button(document, 'before', 'pay', next);
    const seed = defaultTestSeed(document), initial = startRun(document, 'balance', 0, 'start', seed);
    expect(initial.variables['user.balance']).toBe(1500); expect(initial.messages).toHaveLength(1);
    const pending = activate(initial, initial.activeMessageId, 'pay', 0);
    expect(activate(pending, initial.activeMessageId, 'pay', 0)).toBe(pending);
    const done = finish(pending);
    expect(done.variables['user.balance']).toBe(500);
    expect(done.messages.map(item => messageText(done, item))).toEqual(['До: 1500', 'pay', 'После: 500']);
    expect(finishReply(done, pending.id, pending.pending!.id, 350)).toBe(done);
    expect(activate(done, initial.activeMessageId, 'pay', 350)).toBe(done);
    expect(initial.variables['user.balance']).toBe(1500); expect(seed.variables['user.balance']).toBe(1500);
    seed.variables['user.balance'] = 999;
    expect(done.variables['user.balance']).toBe(500);
    expect(startRun(document, 'new', 0).variables['user.balance']).toBe(1500);
  });

  it('selects the first matching typed condition and retains mandatory otherwise with shared reference metadata', () => {
    const document = createFixture();
    setScreen(document, 'start', [{id: 'branch', type: 'decision', cases: [
      {id: 'enough', label: 'Достаточно средств', condition: {variableId: 'user.balance', operator: 'gte', value: literal(1000)}, transition: screen('offer')},
      {id: 'also', label: 'Также совпало', condition: {variableId: 'user.balance', operator: 'gte', value: literal(500)}, transition: screen('details')}
    ], otherwise: screen('menu')}]);
    const first = startRun(document, 'decision', 0);
    expect(first.cursor.stepId).toBe('offer'); expect(first.trace[0].detail).toBe('Совпало: Достаточно средств');
    const seed = defaultTestSeed(document); seed.variables['user.balance'] = 0;
    expect(startRun(document, 'else', 0, 'start', seed).cursor.stepId).toBe('menu');
    expect(documentTransitions(document).filter(item => item.blockId === 'branch').map(item => item.label)).toEqual(['Условие: Достаточно средств', 'Условие: Также совпало', 'Условие: иначе']);
    expect(deletionReason(document, 'offer')).toContain('Достаточно средств');
    expect(stepSummary(document, 'start')).toMatchObject({preview: 'Условие', isEmpty: false});
    const block = document.blocks.branch; if(block.type !== 'decision') throw new Error();
    block.cases[0].condition = {variableId: 'user.balance', operator: 'gte', value: literal('1000')};
    expect(() => validateDocument(document)).toThrow(/типы сравнения/);
  });

  it('stores typed Ask answers once, rejects invalid input without exiting Ask and gives /start priority', () => {
    const document = createFixture();
    setScreen(document, 'start', [{id: 'age', type: 'ask', messageId: 'question', variableId: 'user.age', answerType: 'number', choices: [], success: next, error: null}, message('answer')], {question: 'Возраст?', answer: '{{user.age}} лет'});
    const initial = startRun(document, 'ask', 0);
    const invalid = sendText(initial, initial.id, 'invalid', 'не знаю', 0);
    expect(invalid.pending?.kind).toBe('ask'); expect(invalid.variables['user.age']).toBe(25); expect(invalid.error).toContain('число');
    const answer = sendText(invalid, invalid.id, 'answer', '30', 0);
    expect(answer.variables['user.age']).toBe(30); expect(messageText(answer, answer.messages.at(-1)!)).toBe('30 лет');
    expect(sendText(answer, answer.id, 'answer', '30', 0)).toBe(answer);
    const restarted = sendText(initial, initial.id, 'start', '/start', 0);
    expect(restarted.pending?.kind).toBe('step'); expect(restarted.variables['user.age']).toBe(25);
    expect(messageText(restarted, restarted.messages.at(-1)!)).toBe('/start');
    expect(finish(restarted).pending?.kind).toBe('ask');
    const constrained = sendText(full(initial, 200), initial.id, 'full-answer', '31', 0);
    expect(constrained.messages).toHaveLength(200); expect(constrained.variables['user.age']).toBe(25); expect(constrained.pending?.kind).toBe('ask');
  });

  it('uses choice identity and a typed value instead of treating a label as a command', () => {
    const document = createFixture();
    setScreen(document, 'start', [{id: 'choice', type: 'ask', messageId: 'choices', variableId: 'user.subscribed', answerType: 'choice', choices: [{id: 'yes', label: 'Уже подписан', value: true}], success: next, error: null}, message('selected')]);
    const initial = startRun(document, 'choice', 0); const activationId = initial.cursor.activationId;
    expect(sendText(initial, initial.id, 'typed', 'yes', 0).pending?.kind).toBe('ask');
    const chosen = answerChoice(initial, initial.id, activationId, 'yes', 0);
    expect(chosen.variables['user.subscribed']).toBe(true);
    expect(chosen.messages[1]).toMatchObject({kind: 'user', text: 'Уже подписан'});
    expect(answerChoice(chosen, initial.id, activationId, 'yes', 0)).toBe(chosen);
  });

  it('advances duration/date waits deterministically and deduplicates event activations across loops', () => {
    const document = createFixture();
    setScreen(document, 'start', [{id: 'delay', type: 'wait', wait: {type: 'duration', milliseconds: 1000, unit: 'seconds'}, success: next, timeout: null}, message('delivered')]);
    const initial = startRun(document, 'duration', 0);
    expect(advanceRun(initial, 999).messages).toHaveLength(0);
    const delivered = advanceRun(initial, 1000);
    expect(delivered.messages).toHaveLength(1); expect(advanceRun(delivered, 1000).messages).toHaveLength(1);
    const wait = document.blocks.delay as WaitBlock; wait.wait = {type: 'date', at: 50};
    expect(startRun(document, 'past', 100).messages).toHaveLength(1);
    setScreen(document, 'start', [{id: 'event-wait', type: 'wait', wait: {type: 'event', name: 'paid'}, success: next, timeout: null}, action('event-count', {type: 'increment', variableId: 'run.count', amount: 1}, screen('start'))]);
    const waiting = startRun(document, 'events', 0);
    const once = dispatchRunEvent(waiting, waiting.id, 'delivery-1', 'paid', {amount: 1000}, 1);
    expect(once.variables['run.count']).toBe(1); expect(once.pending?.kind).toBe('wait');
    expect(dispatchRunEvent(once, once.id, 'delivery-1', 'paid', {amount: 1000}, 2)).toBe(once);
    expect(codeContext(once).event.data).toEqual({amount: 1000});
    const twice = dispatchRunEvent(once, once.id, 'delivery-2', 'paid', null, 2);
    expect(twice.variables['run.count']).toBe(2);
  });

  it('resolves timeout before simultaneous event/input, bounds expired loops and lets /start cancel a wait', () => {
    const document = createFixture();
    const wait: WaitBlock = {id: 'deadline', type: 'wait', wait: {type: 'event', name: 'paid'}, success: screen('offer'), timeout: {milliseconds: 1000, transition: screen('menu')}};
    setScreen(document, 'start', [wait]);
    const initial = startRun(document, 'timeout', 0);
    const expired = dispatchRunEvent(initial, initial.id, 'at-deadline', 'paid', null, 1000);
    expect(expired.cursor.stepId).toBe('menu'); expect(expired.eventIds).toEqual([]);
    wait.wait = {type: 'input', mode: 'text', variableId: 'run.answer'};
    const input = startRun(document, 'input-timeout', 0);
    const late = sendText(input, input.id, 'late', 'ответ', 1000);
    expect(late.variables['run.answer']).toBe('');
    expect(finish(late).cursor.stepId).toBe('menu-fallback');
    const accepted = sendText(input, input.id, 'early', 'ответ', 999);
    expect(accepted.variables['run.answer']).toBe('ответ'); expect(accepted.cursor.stepId).toBe('offer');
    const start = sendText(input, input.id, 'start', '/start', 999);
    expect(start.pending?.kind).toBe('step'); expect(start.variables['run.answer']).toBe('');
    wait.timeout = {milliseconds: 1, transition: screen('start')};
    const loops = sendText(startRun(document, 'expired-loop', 0), 'expired-loop', 'late', 'ответ', 10000);
    expect(loops.trace).toHaveLength(101); expect(loops.error).toContain('100 истёкших'); expect(loops.messages).toHaveLength(0);
  });

  it('keeps successful table actions once when retrying only a failed HTTP activation', () => {
    const document = createFixture();
    setScreen(document, 'start', [
      action('create-order', {type: 'table_create', table: 'orders', values: {product: literal('Материал'), status: literal('new'), amount: literal(1000)}, resultVariableId: null}),
      action('update-order', {type: 'table_update', table: 'orders', where: {status: literal('new')}, values: {status: literal('paid')}, resultVariableId: null}),
      action('find-order', {type: 'table_find', table: 'orders', where: {status: literal('paid')}, resultVariableId: 'run.result'}),
      action('http', {type: 'http_mock', method: 'POST', url: 'https://example.invalid/demo', headers: {'Content-Type': 'application/json'}, body: {demo: true}, attempts: 2, fixture: {status: 200, body: {ok: true}, failuresBeforeSuccess: 1}, resultVariableId: 'run.http'}), message('done')
    ]);
    const failed = startRun(document, 'http', 100);
    expect(failed.phase).toBe('failed'); expect(failed.error).toContain('500'); expect(failed.tables.orders).toHaveLength(1);
    expect(failed.tables.orders[0]).toMatchObject({status: 'paid', amount: 1000, createdAt: 100});
    expect(failed.variables['run.result']).toEqual(failed.tables.orders);
    const complete = retryFailed(failed, failed.id, failed.failure!.activationId, 101);
    expect(complete.tables.orders).toHaveLength(1); expect(complete.variables['run.http']).toEqual({status: 200, body: {ok: true}, attempt: 2});
    expect(retryFailed(complete, failed.id, failed.failure!.activationId, 102)).toBe(complete);
    expect(complete.trace.filter(item => item.blockId === 'create-order')).toHaveLength(1);
    expect(complete.trace.filter(item => item.blockId === 'http').map(item => item.attempt)).toEqual([1, 2]);
  });

  it('accepts only the live Code activation, preserves readonly context and retires failed attempts', () => {
    const document = createFixture(); setScreen(document, 'start', [code(), message('result')], {result: '{{run.result}}'});
    const pending = startRun(document, 'code', 0); const originalActivation = pending.cursor.activationId;
    expect(pending.pending?.kind).toBe('code');
    if(pending.pending?.kind !== 'code') throw new Error();
    expect(pending.pending.request.context.user.balance).toBe(1500);
    const failed = completeCode(pending, pending.id, originalActivation, {outcome: 'invented', data: {balance: 1}}, 1);
    expect(failed.phase).toBe('failed'); expect(failed.variables['run.result']).toBeNull();
    const retry = retryFailed(failed, failed.id, originalActivation, 2);
    expect(retry.cursor.activationId).not.toBe(originalActivation);
    expect(completeCode(retry, retry.id, originalActivation, {outcome: 'paid'}, 3)).toBe(retry);
    const done = completeCode(retry, retry.id, retry.cursor.activationId, {outcome: 'paid', data: {balance: 500}}, 3);
    expect(done.variables['user.balance']).toBe(1500); expect(done.variables['run.result']).toEqual({balance: 500});
    expect(messageText(done, done.messages.at(-1)!)).toBe('{"balance":500}');
    expect(completeCode(done, retry.id, retry.cursor.activationId, {outcome: 'paid'}, 4)).toBe(done);
    const reset = sendText(pending, pending.id, 'start', '/start', 1);
    expect(completeCode(reset, pending.id, originalActivation, {outcome: 'paid'}, 2)).toBe(reset);
    expect(finish(reset).cursor.activationId).not.toBe(originalActivation);
  });

  it('retires completed Code when its full reply exceeds capacity without applying returned data or half a batch', () => {
    const document = createFixture(); setScreen(document, 'start', [code(), message('one'), message('two')]);
    const pending = full(startRun(document, 'full-code', 0), 200);
    const limited = completeCode(pending, pending.id, pending.cursor.activationId, {outcome: 'paid', data: {mustNotPersist: true}}, 1);
    expect(limited.phase).toBe('limited'); expect(limited.pending).toBeNull(); expect(limited.messages).toHaveLength(200);
    expect(limited.variables['run.result']).toBeNull();
    expect(completeCode(limited, pending.id, pending.cursor.activationId, {outcome: 'paid'}, 2)).toBe(limited);
  });

  it('reserves the reply using its actual future clock before accepting a button action', () => {
    const document = createFixture();
    setScreen(document, 'offer', [{id: 'time-branch', type: 'decision', cases: [{id: 'late', label: 'После 350', condition: {variableId: 'system.now', operator: 'gte', value: literal(350)}, transition: screen('details')}], otherwise: screen('material')}]);
    setScreen(document, 'details', [message('details-one'), message('details-two')]);
    const initial = full(startRun(document, 'future', 0), 199);
    expect(activationReadiness(initial, initial.activeMessageId, 'start-offer')).toBeNull();
    const rejected = activate(initial, initial.activeMessageId, 'start-offer', 0);
    expect(rejected.pending).toBeNull(); expect(rejected.messages).toBe(initial.messages); expect(rejected.error).toContain('не хватает места');
    expect(rejected.variables).toBe(initial.variables);
  });

  it('pauses automatic loops after the budget and resumes without repeating an already applied action', () => {
    const document = createFixture();
    setScreen(document, 'start', [action('count', {type: 'increment', variableId: 'run.count', amount: 1}, screen('start'))]);
    const paused = startRun(document, 'loop', 0);
    expect(paused.phase).toBe('paused'); expect(paused.variables['run.count']).toBe(ShellLimits.autoTransitions);
    expect(activationReadiness(paused, '', '')).toContain('остановлено');
    const resumed = resumeRun(paused, 1);
    expect(resumed.variables['run.count']).toBe(2 * ShellLimits.autoTransitions);
    expect(new Set(resumed.trace.map(item => item.activationId)).size).toBe(resumed.trace.length);
  });

  it('rejects unsafe variable paths, malformed seeded tables and dates outside the supported calendar', () => {
    const document = createFixture();
    document.variables['user.constructor'] = {id: 'user.constructor', label: 'Unsafe', scope: 'user', valueType: 'string'};
    expect(() => validateDocument(document)).toThrow(/небезопасное/); delete document.variables['user.constructor'];
    const seed = defaultTestSeed(document); seed.tables.orders = [{id: 'row', createdAt: 0, amount: 'wrong'}];
    expect(() => validateTestSeed(document, seed)).toThrow(/каталогу/);
    setScreen(document, 'start', [{id: 'bad-date', type: 'wait', wait: {type: 'date', at: Number.MAX_SAFE_INTEGER}, success: next, timeout: null}]);
    expect(() => validateDocument(document)).toThrow(/дата/);
    setScreen(document, 'start', [code()]);
    const block = document.blocks.calculate as CodeBlock; block.source += '\n//' + 'a'.repeat(6000);
    expect(serializeDocument(validateDocument(document))).toContain('calculate');
    block.source = 'a'.repeat(ShellLimits.codeBytes + 1);
    expect(() => validateDocument(document)).toThrow(/32 KiB/);
  });
});

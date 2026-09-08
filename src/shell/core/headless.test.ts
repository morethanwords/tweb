import {describe, expect, it, vi} from 'vitest';
import {createFixture} from './fixture';
import {createHeadlessRun, HeadlessError, performTestAction, stopReason, type Fixture, type HeadlessOptions} from './headless';
import {codeContext, defaultTestSeed} from './values';
import {dispatchRunEvent, sendText, startRun} from './simulator';
import type {ActionBlock, Block, CodeBlock, JsonValue, ShellDocument, TestRun, Transition} from './types';

const next: Transition = {type: 'continue'};
const end: Transition = {type: 'end'};
const literal = (value: JsonValue) => ({type: 'literal' as const, value});
const message = (id: string): Block => ({id, type: 'message', messageId: id});
const action = (id: string, operation: ActionBlock['action'], success: Transition = next): ActionBlock => ({id, type: 'action', action: operation, success, error: null});
function screen(document: ShellDocument, blocks: Block[], texts: Record<string, string> = {}): void {
  for(const id of document.steps.start.blockIds) {
    const old = document.blocks[id];
    if(old.type === 'message' || old.type === 'ask') {
      for(const buttonId of document.messages[old.messageId].rows.flatMap(row => row.buttonIds)) {delete document.buttons[buttonId]; delete document.content.buttons[buttonId];}
      delete document.messages[old.messageId]; delete document.content.messages[old.messageId];
    }
    delete document.blocks[id];
  }
  document.steps.start.blockIds = blocks.map(block => block.id);
  for(const block of blocks) {
    document.blocks[block.id] = block;
    if(block.type === 'message' || block.type === 'ask') {
      document.messages[block.messageId] = {rows: []}; document.content.messages[block.messageId] = texts[block.messageId] ?? block.messageId;
    }
  }
}
function button(document: ShellDocument, messageId: string, buttonId: string, transition: Transition): void {
  document.messages[messageId].rows.push({id: `${buttonId}-row`, buttonIds: [buttonId]});
  document.buttons[buttonId] = {transition, color: 'default'}; document.content.buttons[buttonId] = buttonId;
}
function fixture(document: ShellDocument, startAt = 0): Fixture {
  // Examples are explicitly materialized here; createHeadlessRun never calls this helper.
  const seed = defaultTestSeed(document);
  for(const definition of Object.values(document.variables)) if(['event', 'system'].includes(definition.scope)) delete seed.variables[definition.id];
  return {startAt, ...seed};
}
function options(): HeadlessOptions {
  return {signal: new AbortController().signal, executeCode: vi.fn(async () => ({ok: true as const, outcome: 'ok', data: null}))};
}
async function start(document: ShellDocument, input = fixture(document)): Promise<TestRun> {
  return (await performTestAction(createHeadlessRun(document, 'headless', input), {type: 'send_text', clientMessageId: 'start', text: '/start'}, options())).run;
}

describe('headless scenario evidence and boundaries', () => {
  it('starts idle, requires every writable fixture and derives readonly values consistently', async () => {
    const document = createFixture(), seed = fixture(document, 123);
    const initial = createHeadlessRun(document, 'headless', seed);
    expect(initial.messages).toEqual([]); expect(initial.observations).toEqual([]); expect(stopReason(initial)).toBe('idle');
    expect(initial.variables['system.now']).toBe(123);
    expect(codeContext(initial).system.now).toBe(initial.variables['system.now']);
    expect(codeContext(initial).event).toEqual({name: '', data: null});
    const missing = structuredClone(seed); delete missing.variables['user.balance'];
    expect(() => createHeadlessRun(document, 'headless', missing)).toThrow(expect.objectContaining({code: 'FIXTURE_INCOMPLETE'}));
    expect(() => createHeadlessRun(document, 'headless', {...seed, variables: {...seed.variables, 'system.now': 999}})).toThrow(expect.objectContaining({code: 'FIXTURE_INVALID'}));
    const first = await performTestAction(initial, {type: 'send_text', clientMessageId: 's', text: '/start'}, options());
    expect(first.receipt.disposition).toBe('accepted');
    expect(first.run.messages.filter(item => item.kind === 'bot')).toHaveLength(1);
    expect(first.run.messages[0]).toMatchObject({kind: 'text', text: '/start'});
    expect(first.run.now).toBe(473);
    expect(initial.messages).toEqual([]);
  });

  it('records intermediate negative balance even when the final balance is restored, without preflight facts', async () => {
    const document = createFixture();
    screen(document, [action('charge', {type: 'increment', variableId: 'user.balance', amount: -2000}), action('refund', {type: 'increment', variableId: 'user.balance', amount: 2000}), message('result')], {result: 'Баланс {{user.balance}}'});
    const run = await start(document);
    expect(run.variables['user.balance']).toBe(1500);
    expect(run.observations.map(item => item.blockId)).toEqual(['charge', 'refund', 'result']);
    expect(run.observations[0].variables['user.balance']).toMatchObject({before: 1500, after: -500});
    expect(run.observations[1].variables['user.balance']).toMatchObject({before: -500, after: 1500});
    expect(run.observations[2].messages[0].text).toBe('Баланс 1500');
  });

  it('keeps Continue as a user gate and chooses each new occurrence through a cycle', async () => {
    const document = createFixture();
    screen(document, [message('buy'), action('charge', {type: 'increment', variableId: 'user.balance', amount: -100}), message('again')]);
    button(document, 'buy', 'pay', next); button(document, 'again', 'back', {type: 'screen', screenId: 'start'});
    let run = await start(document);
    expect(stopReason(run)).toBe('awaiting_button'); expect(run.variables['user.balance']).toBe(1500);
    const old = run.activeMessageId;
    run = (await performTestAction(run, {type: 'click', messageId: 'buy', occurrence: 'latest_active', buttonId: 'pay'}, options())).run;
    expect(run.variables['user.balance']).toBe(1400);
    const stale = await performTestAction(run, {type: 'click', messageId: 'buy', occurrence: {id: old}, buttonId: 'pay'}, options());
    expect(stale.receipt).toMatchObject({disposition: 'ignored', code: 'STALE_OCCURRENCE'});
    run = (await performTestAction(run, {type: 'click', messageId: 'again', occurrence: 'latest_active', buttonId: 'back'}, options())).run;
    expect(run.activeMessageId).not.toBe(old);
    run = (await performTestAction(run, {type: 'click', messageId: 'buy', occurrence: 'latest_active', buttonId: 'pay'}, options())).run;
    expect(run.variables['user.balance']).toBe(1300);
    expect(run.observations.filter(item => item.blockId === 'charge')).toHaveLength(2);
  });

  it('deduplicates message IDs and rejects conflicts without settling another pending effect', async () => {
    const document = createFixture(), idle = createHeadlessRun(document, 'headless', fixture(document));
    const pending = sendText(idle, idle.id, 's', '/start', 0);
    const duplicate = await performTestAction(pending, {type: 'send_text', clientMessageId: 's', text: '/start'}, options());
    expect(duplicate.run).toBe(pending); expect(duplicate.receipt.disposition).toBe('duplicate');
    const conflict = await performTestAction(pending, {type: 'send_text', clientMessageId: 's', text: 'different'}, options());
    expect(conflict.run).toBe(pending); expect(conflict.receipt.code).toBe('MESSAGE_ID_CONFLICT');
  });

  it('does not overshoot a requested advance even during presentation typing', async () => {
    const document = createFixture(), idle = createHeadlessRun(document, 'headless', fixture(document));
    let run = sendText(idle, idle.id, 's', '/start', 0);
    run = (await performTestAction(run, {type: 'advance_by', milliseconds: 100}, options())).run;
    expect(run.now).toBe(100); expect(stopReason(run)).toBe('typing'); expect(run.messages).toHaveLength(1);
    run = (await performTestAction(run, {type: 'advance_by', milliseconds: 250}, options())).run;
    expect(run.now).toBe(350); expect(run.messages).toHaveLength(2);
    expect(run.observations[0].at).toBe(350);
  });

  it('visits successive business wait boundaries exactly and leaves a future wait suspended', async () => {
    const document = createFixture();
    screen(document, [
      {id: 'first', type: 'wait', wait: {type: 'duration', milliseconds: 100, unit: 'seconds'}, success: next, timeout: null},
      message('one'), {id: 'second', type: 'wait', wait: {type: 'duration', milliseconds: 200, unit: 'seconds'}, success: next, timeout: null}, message('two')
    ]);
    let run = await start(document);
    expect(run.now).toBe(350); expect(stopReason(run)).toBe('awaiting_time');
    run = (await performTestAction(run, {type: 'advance_by', milliseconds: 299}, options())).run;
    expect(run.now).toBe(649); expect(run.observations.find(item => item.blockId === 'one')?.at).toBe(450);
    expect(run.observations.some(item => item.blockId === 'two')).toBe(false);
    run = (await performTestAction(run, {type: 'advance_by', milliseconds: 1}, options())).run;
    expect(run.now).toBe(650); expect(stopReason(run)).toBe('ended');
    expect(run.observations.find(item => item.blockId === 'two')?.at).toBe(650);
  });

  it('keeps event identity across loops, canonicalizes data and retains the last accepted named event', async () => {
    const document = createFixture();
    screen(document, [{id: 'paid', type: 'wait', wait: {type: 'event', name: 'paid'}, success: next, timeout: null},
      action('count', {type: 'increment', variableId: 'run.count', amount: 1}, {type: 'screen', screenId: 'start'})]);
    let run = await start(document);
    const unrelated = await performTestAction(run, {type: 'emit_event', eventId: 'unused', name: 'other', data: null}, options());
    expect(unrelated.receipt).toMatchObject({disposition: 'ignored', code: 'EVENT_NOT_EXPECTED'});
    run = (await performTestAction(run, {type: 'emit_event', eventId: 'e', name: 'paid', data: {b: 2, a: 1}}, options())).run;
    run = (await performTestAction(run, {type: 'advance_by', milliseconds: 100}, options())).run;
    const duplicate = await performTestAction(run, {type: 'emit_event', eventId: 'e', name: 'paid', data: {a: 1, b: 2}}, options());
    expect(duplicate.receipt.disposition).toBe('duplicate'); expect(duplicate.run.variables['run.count']).toBe(1);
    const conflict = await performTestAction(run, {type: 'emit_event', eventId: 'e', name: 'paid', data: {a: 9}}, options());
    expect(conflict.receipt.code).toBe('EVENT_ID_CONFLICT'); expect(conflict.run).toBe(run);
    expect(dispatchRunEvent(run, run.id, 'e', 'paid', {a: 9}, 900).error).toContain('другое содержимое');
    expect(codeContext(run).event).toEqual({name: run.variables['event.name'], data: run.variables['event.data']});
    const restarted = await performTestAction(run, {type: 'send_text', clientMessageId: 'again', text: '/start'}, options());
    expect(restarted.run.event).toEqual(run.event);
    expect(restarted.run.observations.find(item => item.wait?.eventId === 'e')?.wait).toMatchObject({cause: 'event', eventName: 'paid'});
  });

  it('lets the timeout win at its exact boundary and cannot revive an event wait with a late event', async () => {
    const document = createFixture();
    screen(document, [{id: 'paid', type: 'wait', wait: {type: 'event', name: 'paid'}, success: {type: 'screen', screenId: 'offer'}, timeout: {milliseconds: 100, transition: end}}]);
    const run = (await performTestAction(await start(document), {type: 'advance_by', milliseconds: 100}, options())).run;
    const late = await performTestAction(run, {type: 'emit_event', eventId: 'late', name: 'paid', data: null}, options());
    expect(late.receipt.disposition).toBe('ignored'); expect(late.run.eventIds).toEqual([]);
    expect(late.run.observations.at(-1)?.wait).toEqual({kind: 'event', cause: 'timeout'});
  });

  it('reports rejected invalid Ask input and requires matching block and activation for a choice', async () => {
    const document = createFixture();
    screen(document, [{id: 'ask', type: 'ask', messageId: 'question', answerType: 'number', variableId: 'user.age', choices: [], success: next, error: null}, message('answered')]);
    let run = await start(document);
    const invalid = await performTestAction(run, {type: 'send_text', clientMessageId: 'bad', text: 'abc'}, options());
    expect(invalid.receipt).toMatchObject({disposition: 'rejected', code: 'INVALID_ANSWER'});
    expect(invalid.run.variables['user.age']).toBe(25); expect(stopReason(invalid.run)).toBe('awaiting_input');
    const answer = await performTestAction(invalid.run, {type: 'send_text', clientMessageId: 'good', text: '31'}, options());
    expect(answer.receipt.disposition).toBe('accepted'); expect(answer.run.variables['user.age']).toBe(31);
    const ask = document.blocks.ask;
    if(ask.type !== 'ask') throw new Error();
    ask.answerType = 'choice'; ask.choices = [{id: 'adult', label: '31 год', value: 31}];
    run = await start(document);
    const wrong = await performTestAction(run, {type: 'choose_answer', blockId: 'other', activationId: run.cursor.activationId, choiceId: 'adult'}, options());
    expect(wrong.receipt.code).toBe('STALE_ACTIVATION');
    const chosen = await performTestAction(run, {type: 'choose_answer', blockId: 'ask', activationId: run.cursor.activationId, choiceId: 'adult'}, options());
    expect(chosen.run.variables['user.age']).toBe(31); expect(chosen.receipt.disposition).toBe('accepted');
  });

  it('reports decision operands and only cases actually evaluated before the selected branch', async () => {
    const document = createFixture();
    screen(document, [{id: 'decision', type: 'decision', cases: [
      {id: 'rich', label: '', condition: {variableId: 'user.balance', operator: 'gte', value: literal(2000)}, transition: end},
      {id: 'eligible', label: '', condition: {variableId: 'user.balance', operator: 'gte', value: literal(1000)}, transition: next},
      {id: 'unreached', label: '', condition: {variableId: 'user.balance', operator: 'gte', value: literal(0)}, transition: end}
    ], otherwise: end}, message('ok')]);
    const run = await start(document);
    expect(run.observations[0].decision).toEqual({selectedCaseId: 'eligible', evaluated: [
      {caseId: 'rich', variableId: 'user.balance', left: 1500, operator: 'gte', right: 2000, matched: false},
      {caseId: 'eligible', variableId: 'user.balance', left: 1500, operator: 'gte', right: 1000, matched: true}
    ]});
    expect(run.observations[0].frameId).toBe(run.observations[1].frameId);
  });

  it('retries only the failed HTTP activation and records one row insertion and both mock attempts', async () => {
    const document = createFixture();
    screen(document, [action('order', {type: 'table_create', table: 'orders', values: {amount: literal(500)}, resultVariableId: null}),
      action('http', {type: 'http_mock', method: 'POST', url: 'https://example.invalid', headers: {}, body: null, attempts: 2, fixture: {status: 200, body: null, failuresBeforeSuccess: 1}, resultVariableId: null}), message('done')]);
    let run = await start(document);
    expect(stopReason(run)).toBe('failed'); expect(run.tables.orders).toHaveLength(1);
    const activationId = run.failure!.activationId;
    run = (await performTestAction(run, {type: 'retry_failed', activationId}, options())).run;
    expect(stopReason(run)).toBe('ended'); expect(run.tables.orders).toHaveLength(1);
    expect(run.observations.filter(item => item.tables.orders.inserted.length)).toHaveLength(1);
    expect(run.observations.filter(item => item.effect?.kind === 'http_mock').map(item => [item.status, item.effect?.attempt, item.effect?.status])).toEqual([['failed', 1, 500], ['succeeded', 2, 200]]);
    expect((await performTestAction(run, {type: 'retry_failed', activationId}, options())).receipt.code).toBe('STALE_ACTIVATION');
  });

  it('settles Code at virtual call time and distinguishes adapter infrastructure from bot failures', async () => {
    const document = createFixture();
    const code: CodeBlock = {id: 'code', type: 'code', name: '', source: 'export default () => ({outcome:"ok",data:null})', outcomes: [{id: 'ok', name: 'ok', transition: next}], resultVariableId: 'run.result'};
    screen(document, [code, message('result')], {result: '{{run.result}} at {{system.now}}'});
    const adapter = options(); adapter.executeCode = async request => ({ok: true, outcome: 'ok', data: request.context.system.now});
    const initial = createHeadlessRun(document, 'headless', fixture(document));
    const run = (await performTestAction(initial, {type: 'send_text', clientMessageId: 's', text: '/start'}, adapter)).run;
    expect(run.now).toBe(350); expect(run.variables['run.result']).toBe(350);
    expect(run.observations.at(-1)?.messages[0].text).toBe('350 at 350');
    adapter.executeCode = async () => ({ok: false, error: 'Worker unavailable', infrastructure: true});
    await expect(performTestAction(initial, {type: 'send_text', clientMessageId: 's', text: '/start'}, adapter)).rejects.toMatchObject({code: 'CODE_INFRASTRUCTURE'});
    adapter.executeCode = async () => ({ok: false, error: 'Explicit bot failure'});
    const failed = await performTestAction(initial, {type: 'send_text', clientMessageId: 's', text: '/start'}, adapter);
    expect(failed.receipt.disposition).toBe('accepted'); expect(stopReason(failed.run)).toBe('failed');
  });

  it('cancels an adapter that ignores abort, and its late completion cannot change the input run', async () => {
    const document = createFixture();
    screen(document, [{id: 'code', type: 'code', name: '', source: 'export default () => ({outcome:"ok",data:null})', outcomes: [{id: 'ok', name: 'ok', transition: end}], resultVariableId: null}]);
    const controller = new AbortController();
    let resolve!: (result: {ok: true; outcome: string; data: null}) => void;
    const initial = createHeadlessRun(document, 'headless', fixture(document));
    const pending = performTestAction(initial, {type: 'send_text', clientMessageId: 's', text: '/start'}, {signal: controller.signal, executeCode: () => new Promise(done => {resolve = done;})});
    controller.abort();
    await expect(pending).rejects.toMatchObject({code: 'CANCELLED'});
    resolve({ok: true, outcome: 'ok', data: null}); await Promise.resolve();
    expect(initial.messages).toEqual([]); expect(initial.observations).toEqual([]);
  });

  it('fails closed on automatic loops, unsafe time, and bounded observation memory before committing an oversized fact', async () => {
    const document = createFixture();
    screen(document, [action('loop', {type: 'increment', variableId: 'run.count', amount: 1}, {type: 'screen', screenId: 'start'})]);
    await expect(start(document)).rejects.toMatchObject({code: 'RESOURCE_LIMIT'});
    const normal = createFixture(), idle = createHeadlessRun(normal, 'headless', fixture(normal));
    await expect(performTestAction(idle, {type: 'advance_by', milliseconds: -1}, options())).rejects.toMatchObject({code: 'INVALID_TIME'});
    const capped = {...idle, captureByteLimit: 10};
    let error: unknown;
    try {await performTestAction(capped, {type: 'send_text', clientMessageId: 's', text: '/start'}, options());} catch(caught) {error = caught;}
    expect(error).toBeInstanceOf(HeadlessError);
    expect(error).toMatchObject({code: 'RESOURCE_LIMIT', run: {observations: [], phase: 'limited'}});
    expect(idle.messages).toEqual([]);
  });

  it('projects legacy preview readonly seeds to the same values read by Code', () => {
    const document = createFixture(), seed = defaultTestSeed(document);
    seed.variables['event.name'] = 'pretend'; seed.variables['event.data'] = {pretend: true}; seed.variables['system.now'] = 99;
    const run = startRun(document, 'legacy', 12, 'start', seed);
    expect(run.variables['event.name']).toBe(''); expect(run.variables['event.data']).toBeNull(); expect(run.variables['system.now']).toBe(12);
    expect(codeContext(run).event).toEqual({name: '', data: null});
  });
});

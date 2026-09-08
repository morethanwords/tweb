import {describe, expect, it} from 'vitest';
import {createFixture} from '../core/fixture';
import {defaultTestSeed} from '../core/values';
import type {ActionBlock, Block, ShellDocument, Transition} from '../core/types';
import {TestService} from './test-service';
import {DocumentService} from './document-service';
import {OperationRegistry} from './registry';
import {bytes, hash, SemanticLimits} from './common';
import {assertionSchema} from './test-schemas';
import {createBlogSuite} from './fixtures';
import type {AssertionResult, CaseReport, CodeExecution, Fixture, Principal, TestAction, TestAssertion, TestCase, TestContract} from './contracts';

const next: Transition = {type: 'continue'};
const end: Transition = {type: 'end'};
const start: TestAction = {type: 'send_text', clientMessageId: 'start', text: '/start'};
const click = (messageId: string, buttonId: string): TestAction => ({type: 'click', messageId, buttonId, occurrence: 'latest_active'});
const message = (id: string): Block => ({id, type: 'message', messageId: id});
const increment = (id: string, amount: number): ActionBlock => ({id, type: 'action', action: {type: 'increment', variableId: 'user.balance', amount}, success: next, error: null});
function screen(document: ShellDocument, blocks: Block[]): void {
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
      document.messages[block.messageId] = {rows: []}; document.content.messages[block.messageId] = block.messageId;
    }
  }
}
function button(document: ShellDocument, messageId: string, id: string, transition: Transition): void {
  document.messages[messageId].rows.push({id: `${id}-row`, buttonIds: [id]});
  document.buttons[id] = {transition, color: 'default'}; document.content.buttons[id] = id;
}
function fixture(document: ShellDocument): Fixture {
  const seed = defaultTestSeed(document);
  for(const definition of Object.values(document.variables)) if(['event', 'system'].includes(definition.scope)) delete seed.variables[definition.id];
  return {...seed, startAt: 0};
}
function assertion(id: string, predicate: TestAssertion['predicate'], extra: Partial<TestAssertion> = {}): TestAssertion {
  return {id, predicate, when: 'at_end', afterStep: null, scope: 'segment', until: null, ...extra};
}
const shown = (messageId: string, min = 1, max: number | null = min) => assertion('shown-' + messageId, {type: 'message', messageId, contains: null, min, max});
function testCase(document: ShellDocument, steps: TestAction[] = [start], expect = [shown('start-message')]): TestCase {
  return {id: 'case', title: 'Case', given: fixture(document), steps, expect};
}
function contract(cases: TestCase[], origin: TestContract['origin'] = 'ad_hoc'): TestContract {
  const data = {origin, suite: {id: 'suite', version: 1, cases}, engineBuild: 'engine-test', fixturePolicy: 'explicit-v1' as const};
  return {...data, hash: hash(data)};
}
function harness(document = createFixture(), executeCode: CodeExecution = async () => ({ok: true, outcome: 'ok', data: null})) {
  const clock = {now: 0};
  const principal: Principal = {id: 'owner', botIds: [document.id], scopes: ['bot:read', 'draft:write', 'simulation:run', 'simulation:read']};
  const registry = new OperationRegistry('epoch', () => clock.now);
  const reservations: {before: number; extra: number}[] = [];
  const service = new TestService('epoch', () => clock.now, executeCode, extra => reservations.push({before: service.retainedBytes(), extra}));
  let sequence = 0;
  const operation = () => registry.claim(principal, document.id, 'test', String(++sequence), {sequence}).operation;
  const run = async (item: TestCase, selectedContract = contract([item])) => {
    const result = await service.batch(document, selectedContract, [item], principal, operation());
    return {result: result.cases[0], report: service.rawReport(result.cases[0].reportId, principal)};
  };
  return {document, clock, principal, registry, service, reservations, operation, run};
}
interface Page extends Omit<CaseReport, 'assertions' | 'receipts' | 'observations'> {
  assertions: AssertionResult[]; receipts: unknown[]; observations: unknown[]; nextOffset: number | null;
  detailCounts: {assertions: number; receipts: number; observations: number; total: number};
  oversizedDetails: {kind: string; index: number; bytes: number}[];
}

describe('headless service contracts', () => {
  it('executes the five frozen blog paths and produces reproducible result hashes', async () => {
    const h = harness(), suite = createBlogSuite(), frozen = contract(suite.cases, 'required_suite');
    const first = await h.service.batch(h.document, frozen, suite.cases, h.principal, h.operation());
    const second = await h.service.batch(h.document, frozen, suite.cases, h.principal, h.operation());
    expect(first.outcome).toBe('passed'); expect(first.complete).toBe(true);
    expect(first.cases.map(item => item.resultHash)).toEqual(second.cases.map(item => item.resultHash));
    expect(first.cases[0].runId).not.toBe(second.cases[0].runId);
    expect(first.cases.every(item => item.origin === 'required_suite' && item.stepsApplied === item.attemptedStepCount)).toBe(true);
  });

  it('blocks incomplete fixtures without convenience defaults and never awards a negative-only case a pass', async () => {
    const h = harness(), missing = testCase(h.document); delete missing.given.variables['user.balance']; missing.given.startAt = 77;
    const result = await h.run(missing);
    expect(result.report).toMatchObject({outcome: 'blocked', stepsApplied: 0, attemptedStepCount: 0, startAt: 77, error: {code: 'FIXTURE_INCOMPLETE'}});
    const onlyNegative = await h.run(testCase(h.document, [start], [shown('material-message', 0, 0)]));
    expect(onlyNegative.report.outcome).toBe('observed');
  });

  it('keeps a twenty-case Unicode batch within 31 KiB while immutable reports retain full titles and error details', async () => {
    const document = createFixture();
    const missing = Array.from({length: 14}, (_, index) => 'run.' + 'x'.repeat(61) + String(index).padStart(2, '0'));
    for(const id of missing) document.variables[id] = {id, label: id, scope: 'run', valueType: 'string'};
    const given = fixture(document); for(const id of missing) delete given.variables[id];
    const cases: TestCase[] = Array.from({length: 20}, (_, index) => ({...testCase(document),
      id: String.fromCodePoint(0x4e00 + index).repeat(128), title: '標'.repeat(160), given}));
    const epoch = 'e'.repeat(36), principal: Principal = {id: 'owner', botIds: [document.id], scopes: ['bot:read', 'simulation:run', 'simulation:read']};
    const service = new TestService(epoch, () => 0, async () => ({ok: false, error: 'Unexpected Code call', infrastructure: true}));
    const registry = new OperationRegistry(epoch, () => 0), frozen = contract(cases);
    const operation = registry.claim(principal, document.id, 'test', 'unicode-batch', {cases}).operation;
    const result = await service.batch(document, frozen, cases, principal, operation);
    expect(result.outcome).toBe('blocked'); expect(result.cases).toHaveLength(20);
    expect(bytes({ok: true, data: result})).toBeLessThanOrEqual(31 * 1024);
    const fullDetails = {message: 'Missing explicit fixture variables: ' + missing.join(', ')};
    expect(bytes(fullDetails)).toBeGreaterThan(900);
    for(const item of result.cases) {
      expect(item.title).toBe('標'.repeat(80) + '…');
      expect(item.error).toEqual({code: 'FIXTURE_INCOMPLETE', details: {truncated: true}});
      const report = service.rawReport(item.reportId, principal);
      expect(report.title).toBe('標'.repeat(160)); expect(report.error?.details).toEqual(fullDetails);
    }
  });

  it('fails an intermediate balance invariant after an unsafe charge even when a later refund restores the balance', async () => {
    const document = createFixture(); screen(document, [increment('charge', -2000), increment('refund', 2000), message('done')]);
    const h = harness(document), item = testCase(document, [start], [shown('done'), assertion('balance-safe', {type: 'variable', variableId: 'user.balance', operator: 'gte', value: 0}, {when: 'always'})]);
    const {report} = await h.run(item);
    expect(report.outcome).toBe('failed'); expect(report.assertions.some(result => result.id === 'balance-safe' && result.actual === -500 && !result.passed)).toBe(true);
    expect(report.observations.filter(item => item.blockId === 'charge')).toHaveLength(1);
    expect(report.observations.find(item => item.blockId === 'refund')?.variables['user.balance'].after).toBe(1500);
  });

  it('cannot certify a retrospective whole-run invariant from only the latest checkpoint', async () => {
    const document = createFixture(); screen(document, [increment('charge', -2000), increment('refund', 2000), message('done')]);
    const h = harness(document), {result} = await h.run(testCase(document, [start], [shown('done')]));
    const invariant = assertion('balance-safe', {type: 'variable', variableId: 'user.balance', operator: 'gte', value: 0}, {when: 'always', scope: 'whole_run'});
    await expect(h.service.continue(result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [invariant, assertion('ended', {type: 'stop', reason: 'ended'})], h.principal, h.operation()))
      .rejects.toMatchObject({code: 'ASSERTION_HISTORY_UNAVAILABLE'});
    const segment = await h.service.continue(result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [{...invariant, scope: 'segment'}], h.principal, h.operation());
    expect(segment.runVersion).toBe(2); expect(segment.outcome).not.toBe('failed');
    const initial = await h.run(testCase(document, [start], [shown('done'), invariant]));
    expect(initial.report.outcome).toBe('failed');
  });

  it('does not infer historical invariants from block observations that omit rejected-input states', async () => {
    const document = createFixture();
    screen(document, [{id: 'ask', type: 'ask', messageId: 'age', variableId: 'user.age', answerType: 'number', choices: [], success: end, error: null}]);
    const h = harness(document), {result, report} = await h.run(testCase(document, [start,
      {type: 'send_text', clientMessageId: 'invalid', text: 'invalid-number'},
      {type: 'send_text', clientMessageId: 'valid', text: '30'}], [shown('age'),
      assertion('invalid', {type: 'receipt', actionIndex: 1, disposition: 'rejected', code: 'INVALID_ANSWER'})]));
    expect(report.observations.some(item => item.variables['conversation.lastInput']?.after === 'invalid-number')).toBe(false);
    await expect(h.service.continue(result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [
      assertion('no-invalid-input', {type: 'variable', variableId: 'conversation.lastInput', operator: 'neq', value: 'invalid-number'}, {when: 'always', scope: 'whole_run'})
    ], h.principal, h.operation())).rejects.toMatchObject({code: 'ASSERTION_HISTORY_UNAVAILABLE'});
  });

  it('reconstructs intermediate invariants from the observation baseline after a rejected answer', async () => {
    const document = createFixture();
    screen(document, [
      {id: 'count', type: 'action', action: {type: 'increment', variableId: 'run.count', amount: 1}, success: next, error: null},
      {id: 'first-run', type: 'decision', cases: [{id: 'first', label: '', condition: {variableId: 'run.count', operator: 'eq', value: {type: 'literal', value: 1}}, transition: {type: 'screen', screenId: 'material'}}], otherwise: next},
      {id: 'restore', type: 'action', action: {type: 'set', variableId: 'conversation.lastInput', value: {type: 'literal', value: 'safe'}}, success: end, error: null}
    ]);
    const askId = document.steps.material.blockIds[0];
    document.blocks[askId] = {id: askId, type: 'ask', messageId: 'material-message', variableId: 'user.age', answerType: 'number', choices: [], success: end, error: null};
    for(const id of document.messages['material-message'].rows.flatMap(row => row.buttonIds)) {delete document.buttons[id]; delete document.content.buttons[id];}
    document.messages['material-message'].rows = [];
    const h = harness(document), initial = await h.run(testCase(document, [start, {type: 'send_text', clientMessageId: 'invalid', text: 'safe'}], [
      shown('material-message'), assertion('rejected-number', {type: 'receipt', actionIndex: 1, disposition: 'rejected', code: 'INVALID_ANSWER'})
    ]));
    expect(initial.report.outcome).toBe('passed');
    const restarted = await h.service.continue(initial.result.runId, 1, [{...start, clientMessageId: 'restart'}], [
      assertion('no-start-value', {type: 'variable', variableId: 'conversation.lastInput', operator: 'neq', value: '/start'}, {when: 'always'}),
      assertion('ended', {type: 'stop', reason: 'ended'})
    ], h.principal, h.operation());
    const report = h.service.rawReport(restarted.reportId, h.principal);
    expect(report.outcome).toBe('failed');
    expect(report.assertions.some(item => item.id === 'no-start-value' && !item.passed && item.actual === '/start')).toBe(true);
    expect(report.assertions.filter(item => item.id === 'no-start-value').at(-1)?.actual).toBe('safe');
  });

  it('rejects unknown table columns and incompatible comparison values before a negative assertion can pass', async () => {
    const h = harness();
    const predicates: TestAssertion['predicate'][] = [
      {type: 'table' as const, table: 'orders' as const, where: {statsu: 'paid'}, min: 0, max: 0},
      {type: 'table' as const, table: 'orders' as const, where: {amount: '500'}, min: 0, max: 0},
      {type: 'variable' as const, variableId: 'user.balance', operator: 'neq' as const, value: '1500'}
    ];
    for(const predicate of predicates) {
      const item = testCase(h.document, [start], [shown('start-message'), assertion('invalid-oracle', predicate)]);
      item.given.tables.orders = [{id: 'paid-order', createdAt: 0, status: 'paid', amount: 500}];
      const {report} = await h.run(item);
      expect(report.outcome).toBe('blocked'); expect(report.stepsApplied).toBe(0); expect(report.observations).toHaveLength(0);
      expect(report.error?.code).toMatch(/^ASSERTION_(REFERENCE_UNKNOWN|TYPE_MISMATCH)$/);
    }
  });

  it('counts actual screen visits across Wait and Continue without counting keyboard retirement as navigation', async () => {
    const document = createFixture();
    screen(document, [message('first'), {id: 'wait', type: 'wait', wait: {type: 'duration', milliseconds: 100, unit: 'seconds'}, success: next, timeout: null}, message('last')]);
    button(document, 'first', 'continue', next); button(document, 'last', 'again', {type: 'screen', screenId: 'start'});
    const h = harness(document);
    const first = await h.run(testCase(document, [start, click('first', 'continue'), {type: 'advance_by', milliseconds: 100}], [
      assertion('one-visit', {type: 'screen', stepId: 'start', min: 1, max: 1}), shown('last')
    ]));
    expect(first.report.outcome).toBe('passed');
    expect(new Set(first.report.observations.map(item => item.frameId)).size).toBeGreaterThan(1);
    expect(new Set(first.report.observations.map(item => item.visitId)).size).toBe(1);
    const second = await h.service.continue(first.result.runId, 1, [click('last', 'again')], [assertion('two-visits', {type: 'screen', stepId: 'start', min: 2, max: 2}, {scope: 'whole_run'})], h.principal, h.operation());
    expect(second.outcome).toBe('passed');
  });

  it('requires explicit expected duplicate or ignored input and retains attempted evidence on rollback', async () => {
    const h = harness(), steps: TestAction[] = [start, start];
    const unexpected = await h.run(testCase(h.document, steps));
    expect(unexpected.report).toMatchObject({outcome: 'blocked', runVersion: 0, stepsApplied: 0, attemptedStepCount: 2, error: {code: 'INPUT_NOT_CONSUMED'}});
    expect(unexpected.report.receipts.map(item => item.disposition)).toEqual(['accepted', 'duplicate']);
    expect(unexpected.report.observations).toHaveLength(1);
    // Whole segment rolled back. The same original /start ID is accepted on the unchanged checkpoint.
    const resumed = await h.service.continue(unexpected.result.runId, 0, [start], [shown('start-message')], h.principal, h.operation());
    expect(resumed.outcome).toBe('passed'); expect(resumed.runVersion).toBe(1);
    const expected = await h.run(testCase(h.document, steps, [shown('start-message'), assertion('duplicate', {type: 'receipt', actionIndex: 1, disposition: 'duplicate', code: 'DUPLICATE_MESSAGE'})]));
    expect(expected.report.outcome).toBe('passed');
  });

  it('captures rejected numeric answers as expected evidence while retaining the Ask value', async () => {
    const document = createFixture();
    screen(document, [{id: 'ask', type: 'ask', messageId: 'age', variableId: 'user.age', answerType: 'number', choices: [], success: end, error: null}]);
    const h = harness(document), {report} = await h.run(testCase(document, [start, {type: 'send_text', clientMessageId: 'invalid', text: 'not a number'}], [
      shown('age'), assertion('invalid-answer', {type: 'receipt', actionIndex: 1, disposition: 'rejected', code: 'INVALID_ANSWER'}),
      assertion('age-unchanged', {type: 'variable', variableId: 'user.age', operator: 'eq', value: 25}), assertion('still-asking', {type: 'stop', reason: 'awaiting_input'})
    ]));
    expect(report.outcome).toBe('passed');
  });

  it('checks invariants on a pure clock advance and validates incompatible assertion scopes before execution', async () => {
    const h = harness();
    const run = await h.run(testCase(h.document, [start, {type: 'advance_by', milliseconds: 100}], [
      shown('start-message'), assertion('time-bound', {type: 'variable', variableId: 'system.now', operator: 'lte', value: 400}, {when: 'always'})
    ]));
    expect(run.report.outcome).toBe('failed'); expect(run.report.assertions.at(-2)?.actual).toBe(450);
    expect(assertionSchema.safeParse(assertion('bad-until', {type: 'variable', variableId: 'user.balance', operator: 'eq', value: 1500}, {until: 1000})).success).toBe(false);
    expect(assertionSchema.safeParse(assertion('bad-always', {type: 'stop', reason: 'ended'}, {when: 'always'})).success).toBe(false);
    await expect(h.service.continue(run.result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [assertion('bad-index', {type: 'receipt', actionIndex: 2, disposition: 'accepted', code: null})], h.principal, h.operation())).rejects.toMatchObject({code: 'ASSERTION_REFERENCE_UNKNOWN'});
    const valid = await h.service.continue(run.result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [], h.principal, h.operation());
    expect(valid.runVersion).toBe(2);
  });

  it('cannot prove a future negative horizon without advancing to it', async () => {
    const h = harness();
    const item = testCase(h.document, [start], [shown('start-message'), assertion('not-yet-material', {type: 'message', messageId: 'material-message', contains: null, min: 0, max: 0}, {until: 1000})]);
    const blocked = await h.run(item);
    expect(blocked.report.error?.code).toBe('ASSERTION_HORIZON_NOT_REACHED');
    expect(blocked.report.observations).toHaveLength(1);
    item.steps.push({type: 'advance_by', milliseconds: 650});
    expect((await h.run(item)).report.outcome).toBe('passed');
  });

  it('pages assertions, receipts and observations under one stable cursor with failures first', async () => {
    const h = harness();
    const checks = Array.from({length: 80}, (_, index) => assertion('check-' + index, {type: 'variable', variableId: 'user.balance', operator: 'eq', value: index === 79 ? 999 : 1500}));
    const {result, report} = await h.run(testCase(h.document, [start], checks));
    const first = h.service.report(result.reportId, h.principal, 0, 20) as Page;
    expect(first.assertions[0]).toMatchObject({id: 'check-79', passed: false}); expect(first.assertions).toHaveLength(20);
    let page = first, total = 0;
    do {
      expect(bytes(page)).toBeLessThanOrEqual(SemanticLimits.responseBytes);
      total += page.assertions.length + page.receipts.length + page.observations.length + page.oversizedDetails.length;
      if(page.nextOffset === null) break;
      page = h.service.report(result.reportId, h.principal, page.nextOffset, 20) as Page;
    } while(total <= first.detailCounts.total);
    expect(total).toBe(report.assertions.length + report.receipts.length + report.observations.length);
    expect(page.nextOffset).toBeNull();
  });

  it('identifies an oversized fact without blocking access to subsequent evidence', async () => {
    const h = harness(), item = testCase(h.document);
    const value = 'x'.repeat(30_000); item.given.variables['run.result'] = value;
    item.expect = [assertion('large', {type: 'variable', variableId: 'run.result', operator: 'eq', value})];
    const {result} = await h.run(item);
    const page = h.service.report(result.reportId, h.principal) as Page;
    expect(page.oversizedDetails).toEqual([{kind: 'assertion', index: 0, bytes: expect.any(Number)}]);
    expect(page.receipts).toHaveLength(1); expect(page.observations).toHaveLength(1);
    expect(bytes(page)).toBeLessThanOrEqual(SemanticLimits.responseBytes); expect(page.nextOffset).toBeNull();
    let offset: number | null = 0, reconstructed = '', contentHash = '';
    do {
      const fragment = h.service.reportFragment(result.reportId, h.principal, {kind: 'assertion', index: 0, offset}) as {nextOffset: number | null; content: string; contentHash: string};
      expect(bytes(fragment)).toBeLessThan(SemanticLimits.responseBytes);
      reconstructed += fragment.content; offset = fragment.nextOffset; contentHash = fragment.contentHash;
    } while(offset !== null);
    const parsed = JSON.parse(reconstructed);
    expect(parsed).toEqual(h.service.rawReport(result.reportId, h.principal).assertions[0]);
    expect(hash(parsed)).toBe(contentHash);
    expect(() => h.service.reportFragment(result.reportId, {...h.principal, id: 'other'}, {kind: 'assertion', index: 0, offset: 0})).toThrow(expect.objectContaining({code: 'NOT_FOUND'}));
    expect(() => h.service.reportFragment(result.reportId, h.principal, {kind: 'assertion', index: 99, offset: 0})).toThrow(expect.objectContaining({code: 'DETAIL_NOT_FOUND'}));
    h.clock.now = SemanticLimits.lifetimeMs;
    expect(() => h.service.reportFragment(result.reportId, h.principal, {kind: 'assertion', index: 0, offset: 0})).toThrow(expect.objectContaining({code: 'REPORT_EXPIRED'}));
  });

  it('caps assertion evidence inside the invariant loop before appending beyond the case budget', async () => {
    const document = createFixture(); screen(document, Array.from({length: 10}, (_, index) => message('m-' + index)));
    const h = harness(document), item = testCase(document, [start], []), value = 'x'.repeat(30_000);
    item.given.variables['run.result'] = value;
    item.expect = Array.from({length: 30}, (_, index) => assertion('large-' + index, {type: 'variable', variableId: 'run.result', operator: 'eq', value}, {when: 'always'}));
    const {report} = await h.run(item);
    expect(report.outcome).toBe('blocked'); expect(report.error?.code).toBe('RESOURCE_LIMIT');
    expect(report.assertions.length).toBeLessThan(30 * 11); expect(report.assertions.length).toBeGreaterThan(30);
    expect(bytes(report)).toBeLessThan(SemanticLimits.caseBytes);
    expect(report.stepsApplied).toBe(0); expect(report.attemptedStepCount).toBe(1);
  });

  it('reserves the exact retained run/report delta across repeated continuations', async () => {
    const h = harness();
    let {result} = await h.run(testCase(h.document));
    expect(h.reservations.at(-1)!.before + h.reservations.at(-1)!.extra).toBe(h.service.retainedBytes());
    for(let index = 0; index < 20; index++) {
      result = await h.service.continue(result.runId, result.runVersion, [{type: 'advance_by', milliseconds: 0}], [], h.principal, h.operation());
      const reservation = h.reservations.at(-1)!;
      expect(reservation.before + reservation.extra).toBe(h.service.retainedBytes()); expect(reservation.extra).toBeGreaterThan(0);
    }
  });

  it('charges documents retained by run checkpoints even when another service releases the source revision', async () => {
    const document = createFixture();
    // An unvisited message remains part of the immutable scenario retained for continuation.
    document.content.messages['material-message'] = 'x'.repeat(4000);
    const h = harness(document), item = testCase(document);
    const {report} = await h.run(item);
    const retained = h.service.retainedBytes();
    expect(retained).toBeGreaterThanOrEqual(bytes(document) + bytes(contract([item])) + bytes(report));
    const reservation = h.reservations.at(-1)!;
    expect(reservation.before + reservation.extra).toBe(retained);
  });

  it('keeps one run writer, cancels detached Code work, and rejects a stale version after resume', async () => {
    const document = createFixture(); screen(document, [message('before'), {id: 'code', type: 'code', name: '', source: 'export default () => ({outcome:"ok",data:null})', outcomes: [{id: 'ok', name: 'ok', transition: next}], resultVariableId: null}, message('after')]);
    button(document, 'before', 'continue', next);
    let resolve!: (value: {ok: true; outcome: string; data: null}) => void;
    let deferred = true;
    const h = harness(document, () => deferred ? new Promise(done => {resolve = done;}) : Promise.resolve({ok: true, outcome: 'ok', data: null}));
    const initial = await h.run(testCase(document, [start], [shown('before')]));
    const operation = h.operation();
    const pending = h.service.continue(initial.result.runId, 1, [click('before', 'continue')], [shown('after')], h.principal, operation);
    await expect(h.service.continue(initial.result.runId, 1, [click('before', 'continue')], [], h.principal, h.operation())).rejects.toMatchObject({code: 'RUN_BUSY'});
    operation.controller.abort(); const cancelled = await pending;
    const evidence = h.service.rawReport(cancelled.reportId, h.principal);
    expect(evidence).toMatchObject({outcome: 'blocked', runVersion: 1, stepsApplied: 0, attemptedStepCount: 1, error: {code: 'CANCELLED'}});
    expect(evidence.observations.some(item => item.blockId === 'code')).toBe(true);
    deferred = false;
    const resumed = await h.service.continue(initial.result.runId, 1, [click('before', 'continue')], [shown('after')], h.principal, h.operation());
    expect(resumed.outcome).toBe('passed'); expect(resumed.runVersion).toBe(2);
    resolve({ok: true, outcome: 'ok', data: null}); await Promise.resolve();
    await expect(h.service.continue(initial.result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [], h.principal, h.operation())).rejects.toMatchObject({code: 'RUN_VERSION_CONFLICT'});
  });

  it('expires raw reports and runtime handles consistently and isolates principals', async () => {
    const h = harness(), {result} = await h.run(testCase(h.document));
    expect(() => h.service.rawReport(result.reportId, {...h.principal, id: 'other'})).toThrow(expect.objectContaining({code: 'NOT_FOUND'}));
    expect(() => h.service.rawReport('old:report:id', h.principal)).toThrow(expect.objectContaining({code: 'INSTANCE_EXPIRED'}));
    h.clock.now = SemanticLimits.lifetimeMs;
    expect(() => h.service.rawReport(result.reportId, h.principal)).toThrow(expect.objectContaining({code: 'REPORT_EXPIRED'}));
    await expect(h.service.continue(result.runId, 1, [{type: 'advance_by', milliseconds: 0}], [], h.principal, h.operation())).rejects.toMatchObject({code: 'RUN_EXPIRED'});
  });

  it('admits host cancellation between purely synchronous scripted actions', async () => {
    const h = harness(), operation = h.operation();
    const item = testCase(h.document, [start, ...Array.from({length: 49}, (): TestAction => ({type: 'advance_by', milliseconds: 0}))]);
    setImmediate(() => operation.controller.abort());
    const result = await h.service.batch(h.document, contract([item]), [item], h.principal, operation);
    expect(result.cases[0]).toMatchObject({outcome: 'blocked', stepsApplied: 0, runVersion: 0, error: {code: 'CANCELLED'}});
    expect(result.cases[0].attemptedStepCount).toBeLessThan(50);
  });

  it('binds certificates to the frozen required case, candidate and contract, never an ad hoc namesake', async () => {
    const h = harness(), item = testCase(h.document), suite = {id: 'required', version: 1, cases: [item]};
    const docs = new DocumentService('epoch', h.document, suite, 'engine-test', () => h.clock.now, h.registry);
    const change = docs.prepare(docs.revision, [{type: 'set_step_title', stepId: 'start', title: 'Updated'}], h.principal, h.operation());
    const batch = await h.service.batch(change.document, change.contract, [item], h.principal, h.operation());
    const result = batch.cases[0]; expect(result.outcome).toBe('passed');
    expect(() => docs.certificate(change, {...result, candidateHash: 'different'})).toThrow(expect.objectContaining({code: 'CERTIFICATE_MISMATCH'}));
    expect(() => docs.certificate(change, {...result, origin: 'ad_hoc'})).toThrow(expect.objectContaining({code: 'CERTIFICATE_MISMATCH'}));
    expect(() => docs.certificate(change, {...result, caseDefinitionHash: 'different'})).toThrow(expect.objectContaining({code: 'CERTIFICATE_MISMATCH'}));
    docs.certificate(change, result); change.validationComplete = true; expect(docs.state(change)).toBe('ready');
    const forged = {...item, steps: [{type: 'advance_by' as const, milliseconds: 0}]};
    await expect(h.service.batch(change.document, change.contract, [forged], h.principal, h.operation())).rejects.toMatchObject({code: 'CASE_DEFINITION_MISMATCH'});
  });
});

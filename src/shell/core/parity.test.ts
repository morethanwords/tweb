import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {activate, advanceRun, answerChoice, completeCode, createIdleRun, dispatchRunEvent, isActiveBotMessage, retryFailed, sendText} from './simulator';
import {clockRun, currentBlock} from './execution';
import {createHeadlessRun, performTestAction, stopReason, type HeadlessOptions, type TestAction} from './headless';
import {createBoundaryDocument, explicitBoundaryFixture} from './boundary-fixture';
import {documentBytes, validateDocument} from './document';
import {ShellLimits, type Block, type CodeRequest, type TestRun} from './types';

const code = (request: CodeRequest) => ({ok: true as const, outcome: 'ok', data: {balance: request.context.user.balance, event: request.context.event.data}});
const options: HeadlessOptions = {signal: new AbortController().signal, executeCode: async request => code(request)};

/** Independent adapter over the APIs used by the browser controller, with externally driven clocks. */
function browserAction(run: TestRun, action: TestAction): TestRun {
  let current = run, target: number | undefined;
  if(action.type === 'send_text') current = sendText(current, current.id, action.clientMessageId, action.text, current.now);
  if(action.type === 'click') {
    const source = action.occurrence === 'latest_active' ? [...current.messages].reverse().find(item => item.kind === 'bot' && item.messageId === action.messageId && isActiveBotMessage(current, item.id)) : current.messages.find(item => item.id === (action.occurrence as {id: string}).id);
    if(source) current = activate(current, source.id, action.buttonId, current.now);
  }
  if(action.type === 'choose_answer') current = answerChoice(current, current.id, action.activationId, action.choiceId, current.now);
  if(action.type === 'emit_event') current = dispatchRunEvent(current, current.id, action.eventId, action.name, action.data, current.now);
  if(action.type === 'retry_failed') current = retryFailed(current, current.id, action.activationId, current.now);
  if(action.type === 'advance_by') target = current.now + action.milliseconds;
  for(let boundaries = 0; boundaries < 100; boundaries++) {
    const pending = current.pending;
    if(pending?.kind === 'code') {
      const result = code(pending.request);
      current = completeCode(current, current.id, pending.activationId, {outcome: result.outcome, data: result.data}, current.now); continue;
    }
    const due = pending?.kind === 'step' ? pending.dueAt : target !== undefined && pending?.kind === 'wait' ? Math.min(pending.dueAt ?? Infinity, pending.timeoutAt ?? Infinity) : Infinity;
    if(Number.isFinite(due) && (target === undefined || due <= target)) {current = advanceRun(current, due); continue;}
    return target === undefined ? current : clockRun(current, target);
  }
  throw new Error('Browser fixture did not settle');
}
function comparable(run: TestRun): Omit<TestRun, 'captureByteLimit'> {
  const {captureByteLimit: _limit, ...rest} = run; return rest;
}
function generatedDocument(seed: number) {
  const document = createFixture();
  for(const id of document.steps.start.blockIds) {
    const block = document.blocks[id];
    if(block.type === 'message' || block.type === 'ask') {
      for(const id of document.messages[block.messageId].rows.flatMap(row => row.buttonIds)) {delete document.buttons[id]; delete document.content.buttons[id];}
      delete document.messages[block.messageId]; delete document.content.messages[block.messageId];
    }
    delete document.blocks[id];
  }
  const blocks: Block[] = [
    {id: 'gate', type: 'message', messageId: 'gate-message'},
    {id: 'charge', type: 'action', action: {type: 'increment', variableId: 'user.balance', amount: -(seed % 7) * 100}, success: {type: 'continue'}, error: null},
    {id: 'age', type: 'ask', messageId: 'age-message', variableId: 'user.age', answerType: 'number', choices: [], success: {type: 'continue'}, error: null},
    {id: 'choice', type: 'ask', messageId: 'choice-message', variableId: 'user.subscribed', answerType: 'choice', choices: [{id: 'yes', label: 'Да', value: true}, {id: 'no', label: 'Нет', value: false}], success: {type: 'continue'}, error: null},
    {id: 'branch', type: 'decision', cases: [{id: 'subscribed', label: 'Подписан', condition: {variableId: 'user.subscribed', operator: 'eq', value: {type: 'literal', value: true}}, transition: {type: 'screen', screenId: 'offer'}}], otherwise: {type: 'continue'}},
    {id: 'delay', type: 'wait', wait: {type: 'duration', milliseconds: 100 + seed, unit: 'seconds'}, success: {type: 'continue'}, timeout: null},
    {id: 'payment', type: 'wait', wait: {type: 'event', name: 'paid'}, success: {type: 'continue'}, timeout: {milliseconds: 200, transition: {type: 'screen', screenId: 'menu'}}},
    {id: 'http', type: 'action', action: {type: 'http_mock', method: 'POST', url: 'https://example.invalid', headers: {}, body: null, attempts: 2, fixture: {status: 200, body: {paid: true}, failuresBeforeSuccess: 1}, resultVariableId: 'run.http'}, success: {type: 'continue'}, error: null},
    {id: 'code', type: 'code', name: 'Pure', source: 'export default () => ({outcome:"ok",data:null})', outcomes: [{id: 'ok', name: 'ok', transition: {type: 'continue'}}], resultVariableId: 'run.result'},
    {id: 'done', type: 'message', messageId: 'done-message'}
  ];
  document.steps.start.blockIds = blocks.map(block => block.id);
  for(const block of blocks) {
    document.blocks[block.id] = block;
    if(block.type === 'message' || block.type === 'ask') {document.messages[block.messageId] = {rows: []}; document.content.messages[block.messageId] = `${block.id}: {{user.balance}} {{system.now}} {{event.name}}`;}
  }
  for(const [messageId, buttonId, transition] of [
    ['gate-message', 'proceed', {type: 'continue'}], ['done-message', 'again', {type: 'screen', screenId: 'start'}]
  ] as const) {
    document.messages[messageId].rows = [{id: `${buttonId}-row`, buttonIds: [buttonId]}];
    document.buttons[buttonId] = {color: 'default', transition}; document.content.buttons[buttonId] = `${buttonId} {{user.balance}}`;
  }
  return validateDocument(document);
}

describe('deterministic headless/browser reducer parity', () => {
  it('matches full states and committed observations for 24 reproducible generated journeys', async () => {
    const covered = new Set<string>();
    for(let seed = 1; seed <= 24; seed++) {
      const document = generatedDocument(seed), fixture = explicitBoundaryFixture(document);
      fixture.variables['user.balance'] = 500 + seed * 100;
      let headless = createHeadlessRun(document, `generated-${seed}`, fixture);
      let browser = createIdleRun(document, headless.id, fixture.startAt, document.entryStepId, {variables: fixture.variables, tables: fixture.tables});
      let random = seed;
      for(let index = 0; index < 28; index++) {
        random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
        const block = currentBlock(headless), reason = stopReason(headless);
        let action: TestAction;
        if(reason === 'idle' || reason === 'ended') action = {type: 'send_text', clientMessageId: `input-${index}`, text: '/start'};
        else if(reason === 'failed') action = {type: 'retry_failed', activationId: headless.failure!.activationId};
        else if(reason === 'awaiting_choice' && block?.type === 'ask') action = {type: 'choose_answer', blockId: block.id, activationId: headless.cursor.activationId, choiceId: block.choices[random % block.choices.length].id};
        else if(reason === 'awaiting_input') action = {type: 'send_text', clientMessageId: `input-${index}`, text: index % 3 === 0 ? 'not a number' : String(14 + random % 40)};
        else if(reason === 'awaiting_event') action = random % 4 === 0 ? {type: 'advance_by', milliseconds: 200} : {type: 'emit_event', eventId: `event-${index}`, name: 'paid', data: {amount: random % 1000}};
        else if(reason === 'awaiting_time' && headless.pending?.kind === 'wait') action = {type: 'advance_by', milliseconds: Math.max(0, headless.pending.dueAt! - headless.now - (random % 3 === 0 ? 1 : 0))};
        else {
          const source = [...headless.messages].reverse().find(item => item.kind === 'bot' && isActiveBotMessage(headless, item.id) && document.messages[item.messageId].rows.length);
          if(source?.kind !== 'bot') throw new Error(`No browser action for ${reason}`);
          const buttons = document.messages[source.messageId].rows.flatMap(row => row.buttonIds);
          action = {type: 'click', messageId: source.messageId, occurrence: 'latest_active', buttonId: buttons[random % buttons.length]};
        }
        const result = await performTestAction(headless, action, options);
        browser = browserAction(browser, action); headless = result.run;
        expect(comparable(headless), `seed=${seed}, action=${index}, type=${action.type}`).toEqual(comparable(browser));
        for(const fact of headless.observations) covered.add(document.blocks[fact.blockId].type);
      }
    }
    expect([...covered].sort()).toEqual(['action', 'ask', 'code', 'decision', 'message', 'wait']);
  });

  it('validates the exact structural boundary and rejects a document above the byte limit', () => {
    const document = createBoundaryDocument();
    expect(Object.keys(document.steps)).toHaveLength(100); expect(Object.keys(document.buttons)).toHaveLength(500);
    expect(Object.keys(document.messages)).toHaveLength(500); expect(Object.keys(document.blocks)).toHaveLength(500);
    expect(documentBytes(document)).toBe(ShellLimits.documentBytes - 512);
    document.content.messages[Object.keys(document.messages)[0]] += 'x'.repeat(513);
    expect(() => validateDocument(document)).toThrow(/1 MiB/);
  });
});

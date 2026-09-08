import {ShellLimits, type CodeRequest, type InputReceipt, type JsonValue, type ShellDocument, type TestRun, type TestSeed} from './types';
import {validateDocument} from './document';
import {clockRun, currentBlock, validTime} from './execution';
import {activate, activationReadiness, advanceRun, answerChoice, classifyTestText, completeCode, createIdleRun,
  dispatchRunEvent, isActiveBotMessage, retryFailed, sendText, textReadiness} from './simulator';
import {fields, object} from './validation';
import {validateJson, validateTestSeed, valueMatches} from './values';

export type {InputReceipt, Observation} from './types';
export type CoreCodeRequest = CodeRequest;
export type Fixture = {startAt: number; variables: Record<string, JsonValue>; tables: TestSeed['tables']};
export type TestAction =
  | {type: 'send_text'; clientMessageId: string; text: string}
  | {type: 'click'; messageId: string; occurrence: 'latest_active' | {id: string}; buttonId: string}
  | {type: 'choose_answer'; blockId: string; activationId: string; choiceId: string}
  | {type: 'advance_by'; milliseconds: number}
  | {type: 'emit_event'; eventId: string; name: string; data: JsonValue}
  | {type: 'retry_failed'; activationId: string};

export type HeadlessErrorCode = 'FIXTURE_INCOMPLETE' | 'FIXTURE_INVALID' | 'DOCUMENT_INVALID' | 'RESOURCE_LIMIT' |
  'CANCELLED' | 'CODE_INFRASTRUCTURE' | 'INVALID_ACTION' | 'INVALID_TIME';
export class HeadlessError extends Error {
  constructor(public readonly code: HeadlessErrorCode, message: string, public readonly run?: TestRun) {
    super(message); this.name = 'HeadlessError';
  }
}
export interface HeadlessOptions {
  signal: AbortSignal;
  executeCode(request: CoreCodeRequest, signal: AbortSignal): Promise<
    {ok: true; outcome: string; data: JsonValue} | {ok: false; error: string; infrastructure?: boolean}>;
}

/** A fixture is evidence, never a request for convenient example defaults. */
export function createHeadlessRun(document: ShellDocument, internalRunId: string, fixture: Fixture): TestRun {
  let detached: ShellDocument;
  try {detached = validateDocument(document);} catch(error) {throw new HeadlessError('DOCUMENT_INVALID', error instanceof Error ? error.message : 'Invalid document');}
  try {
    fields(fixture, ['startAt', 'variables', 'tables'], 'fixture'); validTime(fixture.startAt);
    const supplied = object(fixture.variables, 'fixture.variables');
    const missing = Object.values(detached.variables).filter(definition => !['event', 'system'].includes(definition.scope) && !Object.hasOwn(supplied, definition.id)).map(definition => definition.id);
    if(missing.length) throw new HeadlessError('FIXTURE_INCOMPLETE', `Missing explicit fixture variables: ${missing.join(', ')}`);
    for(const definition of Object.values(detached.variables)) {
      if(definition.scope === 'system' || definition.scope === 'event') {
        const expected = {'system.now': 'number', 'event.name': 'string', 'event.data': 'json'}[definition.id];
        if(!expected || definition.valueType !== expected) throw new HeadlessError('FIXTURE_INVALID', `Unsupported readonly variable: ${definition.id}`);
      }
    }
    for(const [id, value] of Object.entries(supplied)) {
      const definition = detached.variables[id];
      if(!definition || ['system', 'event'].includes(definition.scope)) throw new HeadlessError('FIXTURE_INVALID', `Fixture cannot supply ${id}`);
      if(!valueMatches(validateJson(value), definition.valueType)) throw new HeadlessError('FIXTURE_INVALID', `Invalid fixture type: ${id}`);
    }
    const seed = validateTestSeed(detached, {variables: fixture.variables, tables: fixture.tables});
    const run = createIdleRun(detached, internalRunId, fixture.startAt, detached.entryStepId, seed);
    return {...run, captureByteLimit: 4 * 1024 * 1024};
  } catch(error) {
    if(error instanceof HeadlessError) throw error;
    throw new HeadlessError('FIXTURE_INVALID', error instanceof Error ? error.message : 'Invalid fixture');
  }
}

export function stopReason(run: TestRun): string {
  if(run.phase === 'limited' || run.phase === 'paused') return 'resource_limit';
  if(run.phase === 'failed') return 'failed';
  if(run.pending?.kind === 'step') return 'typing';
  if(run.pending?.kind === 'code') return 'code';
  if(run.pending?.kind === 'ask') {
    const block = currentBlock(run);
    return block?.type === 'ask' && block.answerType === 'choice' ? 'awaiting_choice' : 'awaiting_input';
  }
  if(run.pending?.kind === 'wait') {
    const block = currentBlock(run);
    if(block?.type === 'wait') return block.wait.type === 'event' ? 'awaiting_event' : block.wait.type === 'input' ? 'awaiting_input' : 'awaiting_time';
  }
  if(run.messages.length === 0 && run.sequence === 0) return 'idle';
  if(run.phase === 'ended') return 'ended';
  return 'awaiting_button';
}

function check(run: TestRun, options: HeadlessOptions): void {
  if(options.signal.aborted) throw new HeadlessError('CANCELLED', 'Scenario execution cancelled', run);
  if(run.phase === 'limited' || run.phase === 'paused' || run.observations.length >= ShellLimits.traceEntries) {
    throw new HeadlessError('RESOURCE_LIMIT', run.error ?? 'Scenario execution limit reached', run);
  }
}
async function codeResult(run: TestRun, options: HeadlessOptions): Promise<TestRun> {
  if(run.pending?.kind !== 'code') return run;
  check(run, options);
  const pending = run.pending;
  let removeAbort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    const onAbort = () => reject(new HeadlessError('CANCELLED', 'Scenario execution cancelled', run));
    options.signal.addEventListener('abort', onAbort, {once: true});
    removeAbort = () => options.signal.removeEventListener('abort', onAbort);
  });
  try {
    const result = await Promise.race([options.executeCode(structuredClone(pending.request), options.signal), cancelled]);
    check(run, options);
    if(!result.ok && result.infrastructure) throw new HeadlessError('CODE_INFRASTRUCTURE', result.error, run);
    return completeCode(run, run.id, pending.activationId, result.ok ? {outcome: result.outcome, data: result.data} : {error: result.error}, run.now);
  } catch(error) {
    if(error instanceof HeadlessError) throw error;
    throw new HeadlessError('CODE_INFRASTRUCTURE', error instanceof Error ? error.message : 'Code adapter failed', run);
  } finally {removeAbort();}
}

/** Only presentation typing and isolated Code settle automatically. Ready is a real user gate. */
async function settle(run: TestRun, options: HeadlessOptions, target?: number): Promise<TestRun> {
  let current = run;
  for(let boundaries = 0; boundaries <= ShellLimits.traceEntries; boundaries++) {
    check(current, options);
    if(current.pending?.kind === 'code') {current = await codeResult(current, options); continue;}
    if(current.pending?.kind === 'step') {
      if(target !== undefined && current.pending.dueAt > target) return clockRun(current, target);
      current = advanceRun(current, current.pending.dueAt); continue;
    }
    if(target !== undefined && current.pending?.kind === 'wait') {
      const boundary = Math.min(current.pending.dueAt ?? Infinity, current.pending.timeoutAt ?? Infinity);
      if(boundary <= target) {current = advanceRun(current, boundary); continue;}
    }
    return target === undefined ? current : clockRun(current, target);
  }
  throw new HeadlessError('RESOURCE_LIMIT', 'Too many execution boundaries', current);
}

export async function performTestAction(run: TestRun, action: TestAction, options: HeadlessOptions): Promise<{run: TestRun; receipt: InputReceipt}> {
  check(run, options);
  const from = run.observations.length;
  let next = run;
  let disposition: InputReceipt['disposition'] = 'accepted', code = 'ACCEPTED', consumedByActivationId: string | null = null;
  const reject = (reason: string, ignored = false) => {disposition = ignored ? 'ignored' : 'rejected'; code = reason;};
  let target: number | undefined;
  if(action.type === 'send_text') {
    const prior = run.messages.find(message => message.kind === 'text' && message.clientMessageId === action.clientMessageId);
    if(prior?.kind === 'text') {
      if(prior.text === action.text) {disposition = 'duplicate'; code = 'DUPLICATE_MESSAGE';}
      else reject('MESSAGE_ID_CONFLICT');
    } else if(typeof action.clientMessageId !== 'string' || !action.clientMessageId.trim() || action.clientMessageId.length > 128) reject('INVALID_MESSAGE_ID');
    else if(textReadiness(run, action.text)) reject('INPUT_NOT_READY');
    else {
      consumedByActivationId = classifyTestText(run.document, action.text) === 'start' ? null : run.pending?.kind === 'ask' || run.pending?.kind === 'wait' ? run.cursor.activationId : null;
      next = sendText(run, run.id, action.clientMessageId, action.text, run.now);
      if(!next.messages.some(message => message.kind === 'text' && message.clientMessageId === action.clientMessageId)) reject('INPUT_REJECTED');
      else if(next.error && next.pending?.id === run.pending?.id) reject('INVALID_ANSWER');
    }
  } else if(action.type === 'click') {
    const occurrence = action.occurrence;
    const message = occurrence === 'latest_active' ? [...run.messages].reverse().find(item => item.kind === 'bot' && item.messageId === action.messageId && isActiveBotMessage(run, item.id)) : run.messages.find(item => item.id === occurrence.id);
    if(message?.kind !== 'bot' || message.messageId !== action.messageId) reject('MESSAGE_OCCURRENCE_NOT_FOUND');
    else if(!isActiveBotMessage(run, message.id)) reject('STALE_OCCURRENCE', true);
    else if(run.pending || run.phase !== 'ready') reject('INPUT_NOT_READY', true);
    else if(activationReadiness(run, message.id, action.buttonId)) reject('BUTTON_NOT_READY');
    else {
      consumedByActivationId = message.activationId;
      next = activate(run, message.id, action.buttonId, run.now);
      if(next.messages.length === run.messages.length) reject('BUTTON_REJECTED');
    }
  } else if(action.type === 'choose_answer') {
    const block = currentBlock(run);
    if(run.pending?.kind !== 'ask' || run.pending.activationId !== action.activationId || block?.id !== action.blockId) reject('STALE_ACTIVATION', true);
    else if(block.type !== 'ask' || block.answerType !== 'choice' || !block.choices.some(choice => choice.id === action.choiceId)) reject('CHOICE_NOT_FOUND');
    else {
      consumedByActivationId = action.activationId;
      next = answerChoice(run, run.id, action.activationId, action.choiceId, run.now);
      if(next.messages.length === run.messages.length) reject('CHOICE_REJECTED');
    }
  } else if(action.type === 'advance_by') {
    if(!Number.isSafeInteger(action.milliseconds) || action.milliseconds < 0 || !Number.isSafeInteger(run.now + action.milliseconds)) throw new HeadlessError('INVALID_TIME', 'Time delta must be a non-negative safe integer', run);
    target = run.now + action.milliseconds;
    code = 'TIME_ADVANCED';
  } else if(action.type === 'emit_event') {
    let fingerprint: string;
    try {fingerprint = JSON.stringify([action.name, validateJson(action.data)]);} catch {throw new HeadlessError('INVALID_ACTION', 'Event data must be valid JSON', run);}
    if(typeof action.eventId !== 'string' || !action.eventId.trim() || action.eventId.length > 128 || typeof action.name !== 'string' || !action.name.trim() || action.name.length > 128) reject('INVALID_EVENT');
    else if(Object.hasOwn(run.eventFingerprints, action.eventId)) {
      if(run.eventFingerprints[action.eventId] === fingerprint) {disposition = 'duplicate'; code = 'DUPLICATE_EVENT';}
      else reject('EVENT_ID_CONFLICT');
    } else {
      next = dispatchRunEvent(run, run.id, action.eventId, action.name, action.data, run.now);
      if(next.eventIds.includes(action.eventId)) consumedByActivationId = run.cursor.activationId;
      else if(next === run) reject('EVENT_NOT_EXPECTED', true);
      else reject(next.error ? 'EVENT_REJECTED' : 'EVENT_EXPIRED', !next.error);
    }
  } else if(action.type === 'retry_failed') {
    if(run.phase !== 'failed' || run.failure?.activationId !== action.activationId) reject('STALE_ACTIVATION', true);
    else {
      next = retryFailed(run, run.id, action.activationId, run.now);
      consumedByActivationId = action.activationId;
      if(next.cursor.activationId === run.cursor.activationId) reject('RETRY_UNAVAILABLE');
    }
  } else throw new HeadlessError('INVALID_ACTION', 'Unsupported test action', run);
  // Rejected and duplicate inputs cannot consume a pending effect as a side effect.
  if(disposition === 'accepted') next = await settle(next, options, target);
  check(next, options);
  return {run: next, receipt: {disposition, code, consumedByActivationId, observationRange: {from, to: next.observations.length}}};
}

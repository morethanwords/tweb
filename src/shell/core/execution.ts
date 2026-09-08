import {ShellLimits, type Block, type JsonValue, type RunTrace, type TestRun, type Transition} from './types';
import {codeContext, conditionMatches, projectRuntimeValues, resolveValue, validateJson} from './values';
import {applyLocalAction} from './actions';
import {observeBlock, type ObservationFacts} from './observations';

export function validTime(at: number): void {
  if(!Number.isSafeInteger(at) || at < 0) throw new Error('Некорректное время симуляции.');
}
export function clockRun(run: TestRun, at: number): TestRun {
  validTime(at); if(at < run.now) throw new Error('Время симуляции не может идти назад.');
  const timed = {...run, now: at};
  return {...timed, variables: projectRuntimeValues(timed)};
}
export function currentBlock(run: TestRun): Block | null {
  const id = run.document.steps[run.cursor.stepId].blockIds[run.cursor.blockIndex];
  return id ? run.document.blocks[id] : null;
}
export function trace(run: TestRun, status: RunTrace['status'], detail: string, attempt = 1, facts: ObservationFacts = {}): TestRun {
  const block = currentBlock(run); if(!block) return run;
  const item: RunTrace = {id: run.cursor.activationId, activationId: run.cursor.activationId, blockId: block.id, stepId: run.cursor.stepId, at: run.now, status, detail, attempt};
  const index = run.trace.findIndex(item => item.activationId === run.cursor.activationId);
  const next = {...run, trace: index < 0 ? [...run.trace, item] : run.trace.map((previous, at) => at === index ? item : previous)};
  return status === 'entered' ? next : observeBlock(next, status, detail, facts);
}
export function failed(run: TestRun, message: string, attempt = 1, facts: ObservationFacts = {}): TestRun {
  const block = currentBlock(run);
  const traced = trace(run, 'failed', message, attempt, facts);
  if(traced.phase === 'limited') return traced;
  return {...traced, pending: null, phase: 'failed', error: message,
    failure: block ? {activationId: run.cursor.activationId, blockId: block.id, attempt, message} : null};
}
export function enter(run: TestRun, stepId: string, blockIndex = 0, visitId?: string): TestRun {
  const sequence = run.sequence + 1;
  return {...run, sequence, cursor: {stepId, blockIndex, activationId: '', frameId: `${run.id}:frame:${sequence}`, visitId: visitId ?? `${run.id}:visit:${sequence}`}, pending: null, failure: null, error: null, phase: 'ready'};
}
export function follow(run: TestRun, transition: Transition): TestRun {
  if(run.phase === 'limited') return run;
  if(transition.type === 'end') return {...run, phase: 'ended', pending: null, failure: null, error: null};
  if(transition.type === 'screen') return enter(run, transition.screenId);
  return {...run, cursor: {...run.cursor, blockIndex: run.cursor.blockIndex + 1, activationId: ''}, pending: null, failure: null, error: null, phase: 'ready'};
}
export function activeFrameHasButtons(run: TestRun): boolean {
  return run.messages.some(message => message.kind === 'bot' && message.frameId === run.cursor.frameId && run.document.messages[message.messageId]?.rows.some(row => row.buttonIds.length));
}
function emit(run: TestRun, block: Extract<Block, {type: 'message' | 'ask'}>): TestRun {
  if(run.messages.length >= ShellLimits.messages) return {...run, phase: 'limited', error: 'Достигнут лимит тестового разговора.'};
  const text = run.document.content.messages[block.messageId];
  if(!text.trim()) return failed(run, 'Сообщение на экране пустое. Добавьте текст.');
  const id = `${run.id}:message:${run.messages.length}`;
  return {...run, activeMessageId: id, messages: [...run.messages, {id, kind: 'bot', messageId: block.messageId, stepId: run.cursor.stepId,
    activationId: run.cursor.activationId, frameId: run.cursor.frameId, values: structuredClone(run.variables), at: run.now}]};
}
function dueAt(now: number, delay: number): number {
  const due = now + delay; if(!Number.isSafeInteger(due)) throw new Error('Время ожидания выходит за допустимые границы.'); return due;
}

/** Executes only local pure operations. External Code is an explicit pending effect. */
export function execute(run: TestRun, initialAttempt = 1): TestRun {
  let current = run;
  for(let executed = 0; executed < ShellLimits.autoTransitions; executed++) {
    if(current.pending || ['ended', 'limited', 'failed'].includes(current.phase)) return current;
    const block = currentBlock(current);
    if(!block) return {...current, phase: current.messages.length >= ShellLimits.messages ? 'limited' : activeFrameHasButtons(current) ? 'ready' : 'ended'};
    if(!current.suppressObservations && current.observations.length >= ShellLimits.traceEntries || current.trace.length >= ShellLimits.traceEntries && !current.trace.some(item => item.activationId === current.cursor.activationId)) return {...current, phase: 'limited', error: 'Лимит выполнения достигнут. Начните тест заново.'};
    const retry = !!current.cursor.activationId;
    if(!retry) {
      if(current.trace.length >= ShellLimits.traceEntries || !Number.isSafeInteger(current.sequence + 1)) return {...current, phase: 'limited', error: 'Лимит выполнения достигнут. Начните тест заново.'};
      const sequence = current.sequence + 1;
      current = {...current, sequence, cursor: {...current.cursor, activationId: `${current.id}:activation:${sequence}`}};
    }
    const attempt = executed === 0 ? initialAttempt : 1;
    current = trace(current, 'entered', 'Начало блока', attempt);
    try {
      if(block.type === 'message') {
        current = emit(current, block); if(current.phase === 'limited' || current.phase === 'failed') return current;
        const pauses = current.document.messages[block.messageId].rows.some(row => row.buttonIds.some(id => current.document.buttons[id].transition?.type === 'continue'));
        current = follow(trace(current, 'succeeded', 'Сообщение отправлено'), {type: 'continue'});
        if(pauses) return current;
      } else if(block.type === 'ask') {
        current = emit(current, block); if(current.phase === 'limited' || current.phase === 'failed') return current;
        current = trace(current, 'waiting', 'Ожидается ответ', 1, {wait: {kind: 'ask', cause: 'suspended'}});
        if(current.phase === 'limited') return current;
        return {...current, phase: 'waiting', pending: {id: `${current.cursor.activationId}:ask`, kind: 'ask', activationId: current.cursor.activationId}};
      } else if(block.type === 'decision') {
        const evaluated: NonNullable<ObservationFacts['decision']>['evaluated'] = [];
        const match = block.cases.find(item => {
          const matched = conditionMatches(current.variables, item.condition);
          evaluated.push({caseId: item.id, variableId: item.condition.variableId, left: current.variables[item.condition.variableId] ?? null,
            operator: item.condition.operator, right: item.condition.operator === 'exists' ? null : item.condition.value.type === 'variable' && !Object.hasOwn(current.variables, item.condition.value.variableId) ? null : resolveValue(current.variables, item.condition.value), matched});
          return matched;
        });
        current = follow(trace(current, 'succeeded', match ? `Совпало: ${match.label || match.id}` : 'Иначе', 1,
          {decision: {evaluated, selectedCaseId: match?.id ?? null}}), match?.transition ?? block.otherwise);
      } else if(block.type === 'action') {
        const effect: NonNullable<ObservationFacts['effect']> = {kind: block.action.type, attempt,
          ...(block.action.type === 'http_mock' ? {status: attempt <= block.action.fixture.failuresBeforeSuccess ? 500 : block.action.fixture.status} : {})};
        try {
          const result = applyLocalAction(current, block, attempt);
          current = follow(trace(result.run, 'succeeded', result.detail, attempt, {effect}), block.success);
        } catch(error) {
          const reason = error instanceof Error ? error.message : 'Локальное действие не выполнено.';
          const stopped = failed(current, reason, attempt, {effect: {...effect, error: reason}});
          if(!block.error) return stopped;
          current = follow(stopped, block.error);
        }
      } else if(block.type === 'wait') {
        const date = block.wait.type === 'duration' ? dueAt(current.now, block.wait.milliseconds) : block.wait.type === 'date' ? block.wait.at : null;
        const timeoutAt = block.timeout ? dueAt(current.now, block.timeout.milliseconds) : null;
        if(date !== null && date <= current.now) {current = follow(trace(current, 'succeeded', 'Время ожидания наступило', 1, {wait: {kind: block.wait.type, cause: 'due'}}), block.success); continue;}
        current = trace(current, 'waiting', block.wait.type === 'event' ? `Ожидается событие ${block.wait.name}` : block.wait.type === 'input' ? 'Ожидается ввод' : 'Ожидается время', 1, {wait: {kind: block.wait.type, cause: 'suspended'}});
        if(current.phase === 'limited') return current;
        return {...current, phase: 'waiting',
          pending: {id: `${current.cursor.activationId}:wait`, kind: 'wait', activationId: current.cursor.activationId, dueAt: date, timeoutAt}};
      } else {
        if(!block.source.trim()) return failed(current, 'Добавьте код блока.');
        validateJson(codeContext(current), 'code.context');
        current = trace(current, 'waiting', 'Выполняется изолированный код', attempt, {effect: {kind: 'code', attempt}});
        if(current.phase === 'limited') return current;
        return {...current, phase: 'waiting', pending: {
          id: `${current.cursor.activationId}:code:${attempt}`, kind: 'code', activationId: current.cursor.activationId, blockId: block.id,
          request: {source: block.source, context: codeContext(current), outcomes: block.outcomes.map(item => item.name), variableTypes: Object.fromEntries(Object.values(current.document.variables).map(item => [item.id, item.valueType]))}
        }};
      }
    } catch(error) {return failed(current, error instanceof Error ? error.message : 'Блок не выполнен.', attempt);}
  }
  return {...current, phase: 'paused', error: 'Выполнено 100 автоматических переходов. Измените сценарий или начните заново.'};
}

/** A detached dry run counts a complete synchronous reply before accepting its initiating message. */
export function replyCost(run: TestRun, stepId: string, blockIndex = 0): number {
  const preview = execute(enter({...run, messages: [], trace: [], suppressObservations: true}, stepId, blockIndex));
  return preview.messages.length;
}
export function jsonObject(value: JsonValue): value is Record<string, JsonValue> {return value !== null && typeof value === 'object' && !Array.isArray(value);}

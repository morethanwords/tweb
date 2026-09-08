import {ShellLimits, type JsonValue, type RunMessage, type ShellDocument, type TestRun, type TestSeed, type Transition} from './types';
import {validateDocument} from './document';
import {messageBlockId, stepReadiness, stepFolderId} from './navigation';
import {defaultTestSeed, interpolateText, validateJson, validateTestSeed} from './values';
import {parseAnswer, writeVariable} from './actions';
import {activeFrameHasButtons, clockRun, currentBlock, enter, execute, failed, follow, replyCost, trace, validTime} from './execution';
import type {ObservationFacts} from './observations';

export function isActiveBotMessage(run: TestRun, sourceMessageId: string): boolean {
  const source = run.messages.find(message => message.id === sourceMessageId);
  return source?.kind === 'bot' && source.frameId === run.cursor.frameId;
}
export function refreshRunPhase(run: TestRun): TestRun {
  if(run.pending) return {...run, phase: 'waiting'};
  if(['failed', 'paused'].includes(run.phase)) return run;
  return {...run, phase: run.messages.length >= ShellLimits.messages ? 'limited' : activeFrameHasButtons(run) ? 'ready' : 'ended'};
}
export function buttonReadiness(document: ShellDocument, buttonId: string): string | null {
  if(!Object.hasOwn(document.buttons, buttonId)) return 'Кнопка отсутствует';
  const label = document.content.buttons[buttonId]; if(!label.trim()) return 'У кнопки нет подписи';
  const transition = document.buttons[buttonId].transition;
  if(transition === null) return `«${label}»: ещё не выбран переход`;
  if(transition.type !== 'screen') return null;
  if(!Object.hasOwn(document.steps, transition.screenId)) return `«${label}»: целевой экран отсутствует`;
  const issue = stepReadiness(document, transition.screenId); return issue ? `«${label}»: ${issue}` : null;
}
function destination(run: TestRun, transition: Transition, source?: Extract<RunMessage, {kind: 'bot'}>): {stepId: string; index: number} | null {
  if(transition.type === 'end') return null;
  if(transition.type === 'screen') return {stepId: transition.screenId, index: 0};
  const stepId = source?.stepId ?? run.cursor.stepId;
  const index = source ? run.document.steps[stepId].blockIds.indexOf(messageBlockId(run.document, stepId, source.messageId)) + 1 : run.cursor.blockIndex + 1;
  return {stepId, index};
}
export function pendingMessageCount(run: TestRun): number {return run.pending?.kind === 'step' ? run.pending.reservedMessages : 0;}
export function activationReadiness(run: TestRun, sourceMessageId: string, buttonId: string): string | null {
  if(run.pending) return 'Дождитесь ответа бота.';
  if(run.phase !== 'ready') return run.phase === 'limited' ? 'Достигнут лимит тестового разговора.' : 'Выполнение остановлено. Продолжите или начните тест заново.';
  if(!isActiveBotMessage(run, sourceMessageId)) return 'Кнопки этого сообщения уже неактивны.';
  const source = run.messages.find(message => message.id === sourceMessageId);
  if(source?.kind !== 'bot' || !run.document.messages[source.messageId].rows.some(row => row.buttonIds.includes(buttonId))) return 'Кнопка не принадлежит текущему сообщению.';
  const issue = buttonReadiness(run.document, buttonId); if(issue) return issue;
  const target = destination(run, run.document.buttons[buttonId].transition!, source);
  if(target) {
    const ready = stepReadiness(run.document, target.stepId); if(ready) return ready;
  }
  return run.messages.length + 1 + (target ? replyCost(run, target.stepId, target.index) : 0) > ShellLimits.messages ? 'Для всех сообщений этого экрана не хватает места. Начните тест заново.' : null;
}
export function startRun(document: ShellDocument, runId: string, at: number, startStepId = document.entryStepId, seed?: TestSeed): TestRun {
  return execute(createIdleRun(document, runId, at, startStepId, seed));
}
export function createIdleRun(document: ShellDocument, runId: string, at: number, startStepId = document.entryStepId, seed?: TestSeed): TestRun {
  validTime(at);
  if(typeof runId !== 'string' || !runId.trim() || runId.length > 128) throw new Error('Некорректный идентификатор прохождения.');
  const detached = validateDocument(document);
  if(!Object.hasOwn(detached.steps, startStepId)) throw new Error('Начальный экран прохождения отсутствует.');
  for(const folderId of detached.folderOrder) {
    const issue = stepReadiness(detached, detached.folders[folderId].fallbackStepId);
    if(issue) throw new Error(`Папка «${detached.content.folders[folderId].title || 'Без названия'}», ответ «Если непонятно»: ${issue}`);
  }
  const issue = stepReadiness(detached, startStepId); if(issue) throw new Error(`Начальный экран: ${issue}`);
  const initial = validateTestSeed(detached, seed ?? defaultTestSeed(detached));
  const run: TestRun = {id: runId, document: detached, messages: [], phase: 'ready', activeMessageId: '', pending: null,
    cursor: {stepId: startStepId, blockIndex: 0, activationId: '', frameId: `${runId}:frame:0`, visitId: `${runId}:visit:0`}, sequence: 0, now: at,
    variables: initial.variables, tables: initial.tables, trace: [], observations: [],
    observationCheckpoint: {variables: initial.variables, tables: initial.tables, messageCount: 0},
    eventIds: [], eventFingerprints: {}, event: null, failure: null, error: null};
  const projected = clockRun(run, at);
  return {...projected, observationCheckpoint: {variables: projected.variables, tables: projected.tables, messageCount: 0}};
}
export function jumpRun(run: TestRun, stepId: string, at: number): TestRun {
  try {
    if(!Object.hasOwn(run.document.steps, stepId)) throw new Error('Экран отсутствует в этой версии прохождения.');
    const issue = stepReadiness(run.document, stepId); if(issue) throw new Error(issue);
    const ready = clockRun(run, at);
    if(run.messages.length + replyCost(ready, stepId) > ShellLimits.messages) throw new Error('Для всех сообщений этого экрана не хватает места. Начните тест заново.');
    return execute(enter(ready, stepId));
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Переход не выполнен.'};}
}
function schedule(run: TestRun, stepId: string, index: number, id: string, preserveVisit = false): TestRun {
  const dueAt = run.now + ShellLimits.typingMs; if(!Number.isSafeInteger(dueAt)) throw new Error('Время ответа выходит за допустимые границы.');
  const reservedMessages = replyCost(clockRun(run, dueAt), stepId, index);
  if(run.messages.length + reservedMessages > ShellLimits.messages) throw new Error('Для полного ответа не хватает места. Начните тест заново.');
  return {...run, phase: 'waiting', failure: null, error: null, pending: {id, kind: 'step', targetStepId: stepId, blockIndex: index, reservedMessages, dueAt, ...(preserveVisit ? {visitId: run.cursor.visitId} : {})}};
}
export function activate(run: TestRun, sourceMessageId: string, buttonId: string, at: number): TestRun {
  if(run.phase !== 'ready' || run.pending || !isActiveBotMessage(run, sourceMessageId)) return run;
  const source = run.messages.find(message => message.id === sourceMessageId);
  if(source?.kind !== 'bot' || !run.document.messages[source.messageId].rows.some(row => row.buttonIds.includes(buttonId))) return run;
  const issue = activationReadiness(run, sourceMessageId, buttonId); if(issue) return {...run, error: `${issue}. Вернитесь к редактированию.`};
  try {
    let ready = clockRun(run, at); if(!Number.isSafeInteger(at + ShellLimits.typingMs)) throw new Error('Некорректное время ответа.');
    const transition = run.document.buttons[buttonId].transition!;
    ready = {...ready, messages: [...run.messages, {id: `${run.id}:message:${run.messages.length}`, kind: 'user', stepId: source.stepId, buttonId,
      text: interpolateText(run.document.content.buttons[buttonId], source.values), at}]};
    const target = destination(ready, transition, source);
    return target ? schedule(ready, target.stepId, target.index, `${run.id}:reply:${sourceMessageId}:${buttonId}`, transition.type === 'continue') : {...ready, phase: 'ended', pending: null, error: null};
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Действие не выполнено.'};}
}
export function classifyTestText(document: ShellDocument, text: string): 'start' | 'message' | 'command' {
  const trimmed = text.trim(); const addressed = /^\/start@([A-Za-z][A-Za-z0-9_]*)$/.exec(trimmed);
  if(trimmed === '/start' || addressed && addressed[1].toLowerCase() === document.bot.username.replace(/^@/, '').toLowerCase()) return 'start';
  return trimmed.startsWith('/') ? 'command' : 'message';
}
function textTarget(run: TestRun, category: ReturnType<typeof classifyTestText>): string {
  return category === 'start' ? run.document.entryStepId : run.document.folders[stepFolderId(run.document, run.cursor.stepId)].fallbackStepId;
}
function receivesInput(run: TestRun, category: ReturnType<typeof classifyTestText>): boolean {
  const block = currentBlock(run);
  return run.pending?.kind === 'ask' && block?.type === 'ask' || run.pending?.kind === 'wait' && block?.type === 'wait' && block.wait.type === 'input' &&
    (block.wait.mode === 'any' || block.wait.mode === 'text' && category === 'message' || block.wait.mode === 'command' && category === 'command');
}
export function textReadiness(run: TestRun, text: string): string | null {
  if(typeof text !== 'string' || text.length > ShellLimits.textCharacters * 2 || [...text].length > ShellLimits.textCharacters) return `Сообщение может содержать до ${ShellLimits.textCharacters} символов.`;
  if(!text.trim()) return 'Введите сообщение.';
  const category = classifyTestText(run.document, text);
  if(category !== 'start' && (run.pending?.kind === 'step' || run.pending?.kind === 'code')) return 'Дождитесь ответа бота, затем отправьте сообщение.';
  if(category !== 'start' && receivesInput(run, category)) return run.messages.length >= ShellLimits.messages ? 'Достигнут лимит тестового разговора.' : null;
  const target = textTarget(run, category); const issue = stepReadiness(run.document, target);
  if(issue) return `${category === 'start' ? 'Начальный экран' : 'Ответ «Если непонятно»'}: ${issue}`;
  return run.messages.length + 1 + replyCost(run, target) > ShellLimits.messages ? 'Достигнут лимит тестового разговора. Нажмите «Начать заново» над чатом.' : null;
}
function continuation(run: TestRun, transition: Transition, detail: string, facts: ObservationFacts = {}): TestRun {
  const traced = trace(run, 'succeeded', detail, run.trace.find(item => item.activationId === run.cursor.activationId)?.attempt ?? 1, facts);
  const next = follow(traced, transition);
  if(next.phase === 'ended' || next.phase === 'limited') return next;
  // A new input retires keyboards rendered before the suspended block.
  const sequence = next.sequence + 1;
  return {...next, sequence, cursor: {...next.cursor, frameId: `${next.id}:frame:${sequence}`}};
}
function driveChecked(original: TestRun, candidate: TestRun, retireOnOverflow = false): TestRun {
  if(candidate.phase === 'limited') return candidate;
  const cost = execute({...candidate, messages: [], trace: [], suppressObservations: true}).messages.length;
  if(candidate.messages.length + cost > ShellLimits.messages) {
    const reason = 'Для полного ответа не хватает места. Начните тест заново.';
    return retireOnOverflow ? {...trace(original, 'failed', reason), pending: null, failure: null, phase: 'limited', error: reason} : {...original, error: reason};
  }
  return execute(candidate);
}
function acceptInput(run: TestRun, text: string, original: TestRun): TestRun {
  const block = currentBlock(run);
  if(block?.type === 'ask') {
    try {
      if(block.answerType === 'choice') throw new Error('Выберите один из предложенных вариантов.');
      const written = writeVariable(run, block.variableId, parseAnswer(run, block.variableId, text));
      return driveChecked(original, continuation(written, block.success, `Ответ сохранён в ${block.variableId}`, {wait: {kind: 'ask', cause: 'input'}}));
    } catch(error) {
      const reason = error instanceof Error ? error.message : 'Проверьте ответ.';
      return block.error ? driveChecked(original, follow(trace(run, 'failed', reason), block.error)) : {...run, error: reason};
    }
  }
  if(block?.type === 'wait' && block.wait.type === 'input') {
    try {
      const written = block.wait.variableId ? writeVariable(run, block.wait.variableId, parseAnswer(run, block.wait.variableId, text)) : run;
      return driveChecked(original, continuation(written, block.success, 'Ввод получен', {wait: {kind: 'input', cause: 'input'}}));
    } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Проверьте ввод.'};}
  }
  return run;
}
export function sendText(run: TestRun, runId: string, clientMessageId: string, text: string, at: number): TestRun {
  if(run.id !== runId) return run;
  if(typeof clientMessageId !== 'string' || !clientMessageId.trim() || clientMessageId.length > 128) return {...run, error: 'Некорректный идентификатор сообщения.'};
  const prior = run.messages.find(message => message.kind === 'text' && message.clientMessageId === clientMessageId);
  if(prior?.kind === 'text') return prior.text === text ? run : {...run, error: 'Повторный идентификатор уже принадлежит другому сообщению.'};
  if(typeof text !== 'string') return {...run, error: 'Сообщение должно быть текстом.'};
  if(classifyTestText(run.document, text) !== 'start') {
    for(let expired = 0; run.pending?.kind === 'wait' && run.pending.timeoutAt !== null && at >= run.pending.timeoutAt; expired++) {
      if(expired === ShellLimits.autoTransitions) return {...run, error: 'Обработано 100 истёкших ожиданий. Повторите отправку или начните тест заново.'};
      const previous = run.pending.id, advanced = advanceRun(run, at);
      if(advanced.pending?.id === previous) return advanced;
      run = advanced;
    }
  }
  const issue = textReadiness(run, text); if(issue) return {...run, error: issue};
  try {
    let ready = clockRun(run, at);
    if(Object.hasOwn(ready.document.variables, 'conversation.lastInput')) ready = writeVariable(ready, 'conversation.lastInput', text);
    ready = {...ready, messages: [...run.messages, {id: `${run.id}:message:${run.messages.length}`, kind: 'text', stepId: run.cursor.stepId, text, clientMessageId, at}]};
    const category = classifyTestText(run.document, text);
    if(category !== 'start' && receivesInput(run, category)) return acceptInput(ready, text, run);
    return schedule(ready, textTarget(run, category), 0, `${run.id}:text-reply:${ready.messages.at(-1)!.id}`);
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Сообщение не принято.'};}
}
export function answerChoice(run: TestRun, runId: string, activationId: string, choiceId: string, at: number): TestRun {
  const block = currentBlock(run);
  if(run.id !== runId || run.pending?.kind !== 'ask' || run.pending.activationId !== activationId || block?.type !== 'ask' || block.answerType !== 'choice') return run;
  const choice = block.choices.find(item => item.id === choiceId); if(!choice) return run;
  if(run.messages.length >= ShellLimits.messages) return {...run, error: 'Достигнут лимит тестового разговора.'};
  try {
    let ready = writeVariable(clockRun(run, at), block.variableId, choice.value);
    ready = {...ready, messages: [...run.messages, {id: `${run.id}:message:${run.messages.length}`, kind: 'user', stepId: run.cursor.stepId, buttonId: `choice:${choiceId}`, text: choice.label, at}]};
    return driveChecked(run, continuation(ready, block.success, `Выбрано: ${choice.label}`, {wait: {kind: 'ask', cause: 'input'}}));
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Ответ не принят.'};}
}
export function finishReply(run: TestRun | null, runId: string, pendingReplyId: string, at: number): TestRun | null {
  if(!run || run.id !== runId || run.pending?.kind !== 'step' || run.pending.id !== pendingReplyId || run.phase !== 'waiting') return run;
  const pending = run.pending;
  if(!Number.isSafeInteger(at) || at < pending.dueAt || at < run.now) return run;
  const issue = stepReadiness(run.document, pending.targetStepId);
  if(issue) return refreshRunPhase({...run, pending: null, phase: 'ready', error: `Ответ не отправлен: ${issue}`});
  const ready = clockRun(run, pending.dueAt);
  if(run.messages.length + replyCost(ready, pending.targetStepId, pending.blockIndex) > ShellLimits.messages) return {...run, pending: null, phase: 'limited', error: 'Для полного ответа не хватает места. Начните тест заново.'};
  return execute(enter(ready, pending.targetStepId, pending.blockIndex, pending.visitId));
}
export function advanceRun(run: TestRun, at: number): TestRun {
  if(run.pending?.kind === 'step') return finishReply(run, run.id, run.pending.id, at)!;
  try {
    const ready = clockRun(run, at); const pending = run.pending, block = currentBlock(run);
    if(pending?.kind !== 'wait' || block?.type !== 'wait') return ready;
    const earliest = Math.min(pending.dueAt ?? Infinity, pending.timeoutAt ?? Infinity);
    if(at < earliest) return ready;
    const success = pending.dueAt !== null && pending.dueAt === earliest;
    const timed = clockRun(run, earliest);
    return driveChecked(run, continuation(timed, success ? block.success : block.timeout!.transition, success ? 'Время ожидания наступило' : 'Время ожидания истекло',
      {wait: {kind: block.wait.type, cause: success ? 'due' : 'timeout'}}), true);
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Время не изменено.'};}
}
export function dispatchRunEvent(run: TestRun, runId: string, eventId: string, name: string, data: JsonValue, at: number): TestRun {
  if(run.id !== runId) return run;
  let checked: JsonValue, fingerprint: string;
  try {
    if(typeof eventId !== 'string' || !eventId.trim() || eventId.length > 128 || typeof name !== 'string' || !name.trim() || name.length > 128) throw new Error('Некорректный идентификатор или имя события.');
    checked = validateJson(data); fingerprint = JSON.stringify([name, checked]);
    if(Object.hasOwn(run.eventFingerprints, eventId)) return run.eventFingerprints[eventId] === fingerprint ? run : {...run, error: 'Повторный идентификатор события имеет другое содержимое.'};
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Событие не принято.'};}
  const block = currentBlock(run);
  if(run.pending?.kind !== 'wait' || block?.type !== 'wait' || block.wait.type !== 'event' || block.wait.name !== name) return run;
  if(run.pending.timeoutAt !== null && at >= run.pending.timeoutAt) return advanceRun(run, at);
  try {
    if(run.eventIds.length >= ShellLimits.eventIds) throw new Error('Лимит событий достигнут. Начните тест заново.');
    const ready = clockRun(run, at);
    const next = {...ready, event: {name, data: checked}, eventIds: [...run.eventIds, eventId], eventFingerprints: {...run.eventFingerprints, [eventId]: fingerprint}, variables: {...ready.variables}};
    if(Object.hasOwn(run.document.variables, 'event.name')) next.variables['event.name'] = name;
    if(Object.hasOwn(run.document.variables, 'event.data')) next.variables['event.data'] = checked;
    return driveChecked(run, continuation(next, block.success, `Событие ${name} получено`, {wait: {kind: 'event', cause: 'event', eventId, eventName: name}}), true);
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Событие не принято.'};}
}
export function completeCode(run: TestRun, runId: string, activationId: string, result: {outcome: string; data?: JsonValue} | {error: string}, at: number): TestRun {
  if(run.id !== runId || run.pending?.kind !== 'code' || run.pending.activationId !== activationId) return run;
  const block = currentBlock(run); if(block?.type !== 'code' || block.id !== run.pending.blockId) return run;
  try {
    const ready = clockRun(run, at);
    const checked = validateJson(result, 'code.result');
    if(checked !== null && typeof checked === 'object' && !Array.isArray(checked) && Object.keys(checked).length === 1 && typeof checked.error === 'string') return failed(ready, checked.error, run.trace.find(item => item.activationId === activationId)?.attempt ?? 1, {effect: {kind: 'code', attempt: run.trace.find(item => item.activationId === activationId)?.attempt ?? 1, error: checked.error}});
    if(checked === null || typeof checked !== 'object' || Array.isArray(checked) || Object.keys(checked).some(key => key !== 'outcome' && key !== 'data')) throw new Error('Code вернул недопустимую структуру результата.');
    const outcome = block.outcomes.find(item => item.name === checked.outcome); if(!outcome) throw new Error('Code вернул неизвестный исход.');
    const written = block.resultVariableId && checked.data !== undefined ? writeVariable(ready, block.resultVariableId, checked.data) : ready;
    return driveChecked(run, continuation(written, outcome.transition, `Code: ${outcome.name}`, {effect: {kind: 'code', attempt: run.trace.find(item => item.activationId === activationId)?.attempt ?? 1, outcome: outcome.name}}), true);
  } catch(error) {
    const reason = error instanceof Error ? error.message : 'Code завершился ошибкой.';
    const attempt = run.trace.find(item => item.activationId === activationId)?.attempt ?? 1;
    return failed(run, reason, attempt, {effect: {kind: 'code', attempt, error: reason}});
  }
}
export function retryFailed(run: TestRun, runId: string, activationId: string, at: number): TestRun {
  if(run.id !== runId || run.phase !== 'failed' || run.failure?.activationId !== activationId) return run;
  const block = currentBlock(run); if(block?.type !== 'action' && block?.type !== 'code') return run;
  if(block.type === 'action' && block.action.type === 'http_mock' && run.failure.attempt >= block.action.attempts) return {...run, error: 'Все разрешённые попытки HTTP использованы.'};
  try {
    const sequence = run.sequence + 1;
    return execute({...clockRun(run, at), sequence, cursor: {...run.cursor, activationId: `${run.id}:activation:${sequence}`}, phase: 'ready', pending: null, failure: null, error: null}, run.failure.attempt + 1);
  } catch(error) {return {...run, error: error instanceof Error ? error.message : 'Повтор не выполнен.'};}
}
export function resumeRun(run: TestRun, at: number): TestRun {
  if(run.phase !== 'paused') return run;
  try {return execute({...clockRun(run, at), phase: 'ready', error: null});} catch(error) {return {...run, error: error instanceof Error ? error.message : 'Продолжение не выполнено.'};}
}
export function messageText(run: TestRun, message: RunMessage): string {
  return message.kind === 'bot' ? interpolateText(run.document.content.messages[message.messageId], message.values) : message.text;
}

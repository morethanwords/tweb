import {ShellLimits} from './types';
import type {RunMessage, ShellDocument, TestRun} from './types';
import {validateDocument} from './document';
import {isTerminalStep, stepReadiness, stepButtonIds, stepFolderId} from './navigation';

function validTime(at: number): void {
  if(!Number.isSafeInteger(at) || at < 0) throw new Error('Некорректное время симуляции.');
}

function messageId(runId: string, index: number): string {
  return `${runId}:message:${index}`;
}

function phaseAt(document: ShellDocument, stepId: string, messageCount: number): TestRun['phase'] {
  if(messageCount >= ShellLimits.messages) return 'limited';
  if(isTerminalStep(document, stepId)) return 'ended';
  if(messageCount + 2 > ShellLimits.messages) return 'limited';
  const targets = stepButtonIds(document, stepId)
    .map(id => document.buttons[id].targetStepId).filter((id): id is string => id !== null);
  return targets.length && targets.every(id => messageCount + 1 + document.steps[id].messageIds.length > ShellLimits.messages) ? 'limited' : 'ready';
}

/** Only occurrences in the most recently emitted complete screen batch own live keyboards. */
export function isActiveBotMessage(run: TestRun, sourceMessageId: string): boolean {
  const anchorIndex = run.messages.findIndex(message => message.id === run.activeMessageId);
  const anchor = run.messages[anchorIndex];
  if(!anchor || anchor.kind !== 'bot') return false;
  const count = run.document.steps[anchor.stepId].messageIds.length;
  const index = run.messages.findIndex(message => message.id === sourceMessageId);
  const source = run.messages[index];
  return index >= anchorIndex - count + 1 && index <= anchorIndex && source?.kind === 'bot' && source.stepId === anchor.stepId;
}

export function refreshRunPhase(run: TestRun): TestRun {
  const active = run.messages.find(message => message.id === run.activeMessageId)!;
  return {...run, phase: run.pending ? 'waiting' : phaseAt(run.document, active.stepId, run.messages.length)};
}

/** One readiness source for rendering disabled keyboards and accepting local actions. */
export function buttonReadiness(document: ShellDocument, buttonId: string): string | null {
  if(!Object.hasOwn(document.buttons, buttonId)) return 'Кнопка отсутствует';
  const label = document.content.buttons[buttonId];
  if(!label.trim()) return 'У кнопки нет подписи';
  const target = document.buttons[buttonId].targetStepId;
  if(target === null) return `«${label}»: ещё не выбран переход`;
  if(!Object.hasOwn(document.steps, target)) return `«${label}»: целевой экран отсутствует`;
  const issue = stepReadiness(document, target);
  if(issue) return `«${label}»: ${issue}`;
  return null;
}

/** A screen is emitted atomically; its final occurrence anchors the active batch. */
function botBatch(document: ShellDocument, runId: string, stepId: string, offset: number, at: number): RunMessage[] {
  return document.steps[stepId].messageIds.map((authoredMessageId, index) => ({
    id: messageId(runId, offset + index), kind: 'bot', stepId, messageId: authoredMessageId, at
  }));
}

export function pendingMessageCount(run: TestRun): number {
  return run.pending ? run.document.steps[run.pending.targetStepId].messageIds.length : 0;
}

export function activationReadiness(run: TestRun, sourceMessageId: string, buttonId: string): string | null {
  if(run.phase === 'waiting') return 'Дождитесь ответа бота.';
  if(!isActiveBotMessage(run, sourceMessageId)) return 'Кнопки этого сообщения уже неактивны.';
  const source = run.messages.find(message => message.id === sourceMessageId);
  if(!source || source.kind !== 'bot' || !run.document.messages[source.messageId].rows.some(row => row.buttonIds.includes(buttonId))) return 'Кнопка не принадлежит текущему сообщению.';
  const issue = buttonReadiness(run.document, buttonId);
  if(issue) return issue;
  const target = run.document.buttons[buttonId].targetStepId!;
  return run.messages.length + 1 + run.document.steps[target].messageIds.length > ShellLimits.messages
    ? 'Для всех сообщений этого экрана не хватает места. Начните тест заново.' : null;
}

export function startRun(document: ShellDocument, runId: string, at: number, startStepId = document.entryStepId): TestRun {
  validTime(at);
  if(typeof runId !== 'string' || !runId.trim() || runId.length > 128) throw new Error('Некорректный идентификатор прохождения.');
  const detached = validateDocument(document);
  if(!Object.hasOwn(detached.steps, startStepId)) throw new Error('Начальный экран прохождения отсутствует.');
  for(const folderId of detached.folderOrder) {
    const issue = stepReadiness(detached, detached.folders[folderId].fallbackStepId);
    if(issue) throw new Error(`Папка «${detached.content.folders[folderId].title || 'Без названия'}», ответ «Если непонятно»: ${issue}`);
  }
  const issue = stepReadiness(detached, startStepId);
  if(issue) throw new Error(`Начальный экран: ${issue}`);
  const messages = botBatch(detached, runId, startStepId, 0, at);
  const activeMessageId = messages.at(-1)!.id;
  return {
    id: runId, document: detached,
    messages,
    phase: phaseAt(detached, startStepId, messages.length), activeMessageId,
    pending: null, error: null
  };
}

/** Author navigation is explicit and immediate; it never creates a fictitious visitor action. */
export function jumpRun(run: TestRun, stepId: string, at: number): TestRun {
  if(!Object.hasOwn(run.document.steps, stepId)) return {...run, error: 'Экран отсутствует в этой версии прохождения.'};
  const issue = stepReadiness(run.document, stepId);
  if(issue) return {...run, error: issue};
  if(run.messages.length + run.document.steps[stepId].messageIds.length > ShellLimits.messages) {
    return {...run, error: 'Для всех сообщений этого экрана не хватает места. Начните тест заново.'};
  }
  try {
    validTime(at);
    if(at < run.messages.at(-1)!.at) throw new Error('Время симуляции не может идти назад.');
  } catch(cause) {
    return {...run, error: cause instanceof Error ? cause.message : 'Некорректное время симуляции.'};
  }
  const replies = botBatch(run.document, run.id, stepId, run.messages.length, at);
  return {...run, messages: [...run.messages, ...replies], activeMessageId: replies.at(-1)!.id,
    pending: null, phase: phaseAt(run.document, stepId, run.messages.length + replies.length), error: null};
}

/** The source message occurrence is the activation identity; old keyboards never re-open. */
export function activate(run: TestRun, sourceMessageId: string, buttonId: string, at: number): TestRun {
  if(run.phase !== 'ready' || !isActiveBotMessage(run, sourceMessageId)) return run;
  const source = run.messages.find(message => message.id === sourceMessageId);
  if(!source || source.kind !== 'bot' || source.id !== sourceMessageId) return run;
  const buttonIds = run.document.messages[source.messageId].rows.flatMap((row) => row.buttonIds);
  if(!buttonIds.includes(buttonId)) return run;
  const button = run.document.buttons[buttonId];
  const issue = activationReadiness(run, sourceMessageId, buttonId);
  if(issue) return {...run, error: `${issue}. Вернитесь к редактированию.`};
  try {
    validTime(at);
    if(at < run.messages[run.messages.length - 1].at || !Number.isSafeInteger(at + ShellLimits.typingMs)) throw new Error('Время симуляции не может идти назад.');
  } catch(cause) {
    return {...run, error: cause instanceof Error ? cause.message : 'Некорректное время симуляции.'};
  }
  const id = messageId(run.id, run.messages.length);
  return {
    ...run, messages: [...run.messages, {id, kind: 'user', stepId: source.stepId, buttonId, text: run.document.content.buttons[buttonId], at}],
    phase: 'waiting', pending: {
      id: `${run.id}:reply:${sourceMessageId}:${buttonId}`, kind: 'step',
      targetStepId: button.targetStepId!, dueAt: at + ShellLimits.typingMs
    }, error: null
  };
}

/** Only the explicit start command (optionally addressed to this bot) has built-in semantics. */
export function classifyTestText(document: ShellDocument, text: string): 'start' | 'message' | 'command' {
  const trimmed = text.trim();
  const addressed = /^\/start@([A-Za-z][A-Za-z0-9_]*)$/.exec(trimmed);
  if(trimmed === '/start' || (addressed && addressed[1].toLowerCase() === document.bot.username.replace(/^@/, '').toLowerCase())) return 'start';
  return trimmed.startsWith('/') ? 'command' : 'message';
}

/** The active screen owns fallback context; author selection is never consulted. */
function textTarget(run: TestRun, category: ReturnType<typeof classifyTestText>): string {
  if(category === 'start') return run.document.entryStepId;
  const source = run.messages.find(message => message.id === run.activeMessageId);
  if(!source || source.kind !== 'bot') throw new Error('Текущий экран разговора недоступен.');
  return run.document.folders[stepFolderId(run.document, source.stepId)].fallbackStepId;
}

/** Composer availability and reducer acceptance share the exact capacity and response rules. */
export function textReadiness(run: TestRun, text: string): string | null {
  if(typeof text !== 'string' || text.length > ShellLimits.textCharacters * 2 || [...text].length > ShellLimits.textCharacters) {
    return `Сообщение может содержать до ${ShellLimits.textCharacters} символов.`;
  }
  if(!text.trim()) return 'Введите сообщение.';
  const category = classifyTestText(run.document, text);
  if(run.pending && category !== 'start') return 'Дождитесь ответа бота, затем отправьте сообщение.';
  const target = textTarget(run, category);
  const issue = stepReadiness(run.document, target);
  if(issue) return `${category === 'start' ? 'Начальный экран' : 'Ответ «Если непонятно»'}: ${issue}`;
  // /start replaces the old pending reply; only its own full batch is reserved.
  if(run.messages.length + 1 + run.document.steps[target].messageIds.length > ShellLimits.messages) {
    return 'Достигнут лимит тестового разговора. Нажмите «Начать заново» над чатом.';
  }
  return null;
}

/** Idempotency is (runId, clientMessageId); visible commands and their replies are accepted atomically. */
export function sendText(run: TestRun, runId: string, clientMessageId: string, text: string, at: number): TestRun {
  if(run.id !== runId) return run;
  if(typeof clientMessageId !== 'string' || !clientMessageId.trim() || clientMessageId.length > 128) {
    return {...run, error: 'Некорректный идентификатор сообщения.'};
  }
  const existing = run.messages.find(message => message.kind === 'text' && message.clientMessageId === clientMessageId);
  if(existing?.kind === 'text') {
    return existing.text === text ? run : {...run, error: 'Повторный идентификатор уже принадлежит другому сообщению.'};
  }
  const issue = textReadiness(run, text);
  if(issue) return {...run, error: issue};
  const source = run.messages.find(message => message.id === run.activeMessageId);
  if(!source || source.kind !== 'bot') return {...run, error: 'Текущий экран разговора недоступен.'};
  const category = classifyTestText(run.document, text);
  try {
    validTime(at);
    if(at < run.messages[run.messages.length - 1].at || !Number.isSafeInteger(at + ShellLimits.typingMs)) throw new Error('Время симуляции не может идти назад.');
  } catch(cause) {
    return {...run, error: cause instanceof Error ? cause.message : 'Некорректное время симуляции.'};
  }
  const message: RunMessage = {
    id: messageId(run.id, run.messages.length), kind: 'text', stepId: source.stepId, text, clientMessageId, at
  };
  const pendingId = `${run.id}:text-reply:${message.id}`;
  const pending: TestRun['pending'] = {
    id: pendingId, kind: 'step', targetStepId: textTarget(run, category), dueAt: at + ShellLimits.typingMs
  };
  return {...run, messages: [...run.messages, message], pending, phase: 'waiting', error: null};
}

/** A canceled/restarted run or duplicate/early callback cannot append a reply. */
export function finishReply(run: TestRun | null, runId: string, pendingReplyId: string, at: number): TestRun | null {
  if(!run || run.id !== runId || run.phase !== 'waiting' || run.pending?.id !== pendingReplyId) return run;
  if(!Number.isSafeInteger(at) || at < run.pending.dueAt || at < run.messages[run.messages.length - 1].at) return run;
  const pending = run.pending;
  const stepId = pending.targetStepId;
  const issue = stepReadiness(run.document, stepId);
  if(issue) {
    const source = run.messages.find(message => message.id === run.activeMessageId)!;
    return {...run, pending: null, phase: phaseAt(run.document, source.stepId, run.messages.length), error: `Ответ не отправлен: ${issue}`};
  }
  // Late delivery has a stable timestamp independent of callback scheduling delays.
  const replies = botBatch(run.document, run.id, stepId, run.messages.length, pending.dueAt);
  return {
    ...run, messages: [...run.messages, ...replies],
    phase: phaseAt(run.document, stepId, run.messages.length + replies.length),
    activeMessageId: replies.at(-1)!.id,
    pending: null, error: null
  };
}

export function messageText(run: TestRun, message: RunMessage): string {
  if(message.kind === 'text' || message.kind === 'user') return message.text;
  return run.document.content.messages[message.messageId];
}

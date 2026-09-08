import {batch, createSignal} from 'solid-js';
import * as core from './core';
import {ShellLimits, type AiAdapter, type DocumentCommand, type KeyboardDraft, type ShellDocument} from './core/types';

export type Demo = 'greeting' | 'detail' | 'menu';
export type RunTextEdit = {runId: string; messageId: string; stepId: string; sourceOccurrenceId: string};
type AiStatus = {id: string; baseRevision: number; documentId: string; controller: AbortController; timer: ReturnType<typeof setTimeout>} | null;
export interface Dependencies {
  now?: () => number;
  id?: (prefix: string) => string;
  aiAdapter?: AiAdapter;
  onMessageTextChange?: (stepId: string, text: string, messageId: string) => void;
}

export function createController(options: Dependencies = {}) {
  let sequence = 0;
  const epoch = Date.now();
  const monotonicBase = performance.now();
  const now = options.now ?? (() => Math.floor(epoch + performance.now() - monotonicBase));
  const id = options.id ?? ((prefix: string) => `${prefix}_${++sequence}`);
  const [editor, storeEditor] = createSignal(core.createEditor(core.createFixture()));
  const [run, setRun] = createSignal<ReturnType<typeof core.startRun> | null>(null);
  const [runTextEdit, setRunTextEdit] = createSignal<RunTextEdit | null>(null);
  const [ai, setAi] = createSignal<AiStatus>(null);
  const [notice, setNotice] = createSignal('');
  const [exportRevision, setExportRevision] = createSignal<number | null>(null);
  let replyTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let creationExport: {messageId: string; revision: number} | null = null;

  function setEditor(change: ReturnType<typeof core.createEditor> | ((state: ReturnType<typeof core.createEditor>) => ReturnType<typeof core.createEditor>)) {
    if(disposed) return;
    const previous = editor();
    const next = typeof change === 'function' ? change(previous) : change;
    storeEditor(next);
    if(options.onMessageTextChange && previous.document !== next.document) {
      for(const stepId of core.allStepIds(next.document)) {
        if(disposed) break;
        for(const messageId of next.document.steps[stepId].messageIds) {
          if(disposed) break;
          const text = next.document.content.messages[messageId];
          if(previous.document.content.messages[messageId] !== text) {
            try { options.onMessageTextChange(stepId, text, messageId); }
            catch { if(!disposed) setNotice('Текст изменён. Подключённый обработчик не смог принять обновление.'); }
          }
        }
      }
    }
  }
  function dismissNotice() { setNotice(''); setEditor(state => ({...state, error: null})); }
  function cancelAi(message = '') {
    const request = ai();
    setAi(null); // Invalidate before abort: callbacks may settle synchronously.
    if(request) {
      clearTimeout(request.timer);
      request.controller.abort();
      if(message) setNotice(message);
    }
  }
  function manual() { cancelAi('AI-запрос отменён: вы начали редактирование.'); }
  function runWithEditedText(next: ReturnType<typeof core.createEditor>): ReturnType<typeof core.startRun> | null {
    const active = runTextEdit();
    const current = run();
    if(!active || !current || current.id !== active.runId || !current.document.steps[active.stepId]?.messageIds.includes(active.messageId)) {
      throw new Error('Прохождение изменилось. Откройте сообщение заново.');
    }
    const text = next.document.content.messages[active.messageId];
    if(text === current.document.content.messages[active.messageId]) return current;
    const candidate = core.validateDocument(current.document);
    candidate.content.messages[active.messageId] = text;
    return core.refreshRunPhase({...current, document: core.validateDocument(candidate)});
  }
  function finishText(cancel = false) {
    if(disposed) return;
    const previous = editor();
    const next = core.finishTextEdit(previous, cancel);
    if(previous.textEdit?.creation && !next.error) {
      const messageId = previous.textEdit.messageId;
      const abandoned = !Object.hasOwn(next.document.content.messages, messageId);
      if(abandoned && creationExport?.messageId === messageId && exportRevision() === creationExport.revision) setExportRevision(next.revision);
      creationExport = null;
    }
    if(!runTextEdit() || next.error) {setEditor(next); return;}
    try {
      const nextRun = runWithEditedText(next);
      batch(() => {setRunTextEdit(null); setRun(nextRun); setEditor(next);});
    } catch(cause) {
      setEditor(state => ({...state, error: cause instanceof Error ? cause.message : 'Не удалось завершить редактирование.'}));
    }
  }
  function mutate(value: DocumentCommand, expectedRevision?: number) {
    manual();
    finishText();
    setEditor(state => core.command(state, value, expectedRevision ?? state.revision));
  }
  function applyRunKeyboard(sourceOccurrenceId: string, keyboard: KeyboardDraft, expectedRevision: number): boolean {
    if(disposed) return false;
    manual(); finishText();
    const current = run();
    const source = current?.messages.find(message => message.id === sourceOccurrenceId);
    const previous = editor();
    try {
      if(!current || !source || source.kind !== 'bot' || current.document.id !== previous.document.id ||
        !previous.document.steps[source.stepId]?.messageIds.includes(source.messageId)) {
        throw new Error('Сообщение в сценарии изменилось. Начните новый тест.');
      }
      const authorKeyboard = core.keyboardDraft(previous.document, source.stepId, source.messageId);
      const runKeyboard = core.keyboardDraft(current.document, source.stepId, source.messageId);
      if(JSON.stringify(authorKeyboard) !== JSON.stringify(runKeyboard)) throw new Error('Кнопки в сценарии изменились. Начните новый тест.');
      const operation: DocumentCommand = {type: 'set_keyboard', stepId: source.stepId, messageId: source.messageId, keyboard};
      const next = core.command(previous, operation, expectedRevision);
      if(next.error) {setEditor(next); return false;}
      const local = core.createEditor(current.document);
      const updated = core.command(local, operation, local.revision);
      if(updated.error) throw new Error(updated.error);
      const nextRun = core.refreshRunPhase({...current, document: updated.document});
      batch(() => {setRun(nextRun); setEditor(next);});
      return true;
    } catch(cause) {
      setEditor(state => ({...state, error: cause instanceof Error ? cause.message : 'Не удалось изменить кнопки.'}));
      return false;
    }
  }
  function renameStep(stepId: string, title: string, expectedRevision?: number): boolean {
    if(disposed) return false;
    manual(); finishText();
    const previous = editor();
    const current = run();
    const operation: DocumentCommand = {type: 'set_step_title', stepId, title};
    const next = core.command(previous, operation, expectedRevision ?? previous.revision);
    if(next.error) {setEditor(next); return false;}
    try {
      if(current) {
        if(current.document.id !== previous.document.id || !Object.hasOwn(current.document.steps, stepId)) throw new Error('Экран отсутствует в этой версии прохождения.');
        const local = core.createEditor(current.document);
        const updated = core.command(local, operation, local.revision);
        if(updated.error) throw new Error(updated.error);
        batch(() => {setRun({...current, document: updated.document}); setEditor(next);});
      } else setEditor(next);
      return true;
    } catch(cause) {
      setEditor(state => ({...state, error: cause instanceof Error ? cause.message : 'Не удалось изменить название.'}));
      return false;
    }
  }
  function beginNewMessage(stepId: string, messageId: string): boolean {
    if(disposed || run()) return false;
    manual();
    if(editor().textEdit?.creation && editor().textEdit?.messageId === messageId && editor().textEdit?.stepId === stepId) return true;
    finishText();
    const before = editor();
    const next = core.beginNewMessage(before, stepId, messageId);
    if(!next.error && next.textEdit?.creation) {
      creationExport = exportRevision() === before.revision ? {messageId, revision: before.revision} : null;
    }
    setEditor(next);
    return !next.error && next.textEdit?.messageId === messageId;
  }
  function beginText(stepId: string, messageId = editor().document.steps[stepId]?.messageIds[0]) {
    manual();
    finishText();
    setEditor(state => core.beginTextEdit(state, stepId, messageId));
  }
  function beginRunText(sourceOccurrenceId: string): boolean {
    if(disposed) return false;
    if(runTextEdit()?.sourceOccurrenceId === sourceOccurrenceId && runTextEdit()?.runId === run()?.id) return true;
    manual(); finishText();
    const current = run();
    const source = current?.messages.find(message => message.id === sourceOccurrenceId);
    if(!current || !source || source.kind !== 'bot' || current.document.id !== editor().document.id ||
      !editor().document.steps[source.stepId]?.messageIds.includes(source.messageId) ||
      editor().document.content.messages[source.messageId] !== current.document.content.messages[source.messageId]) {
      setNotice('Сообщение в сценарии изменилось. Вернитесь в редактор и начните новый тест.');
      return false;
    }
    const next = core.beginTextEdit(editor(), source.stepId, source.messageId);
    if(next.error) {setEditor(next); return false;}
    batch(() => {
      setRunTextEdit({runId: current.id, messageId: source.messageId, stepId: source.stepId, sourceOccurrenceId});
      setEditor(next);
    });
    return true;
  }
  function inputText(text: string) {
    if(disposed) return;
    const next = core.inputText(editor(), text);
    if(!runTextEdit() || next.error) {setEditor(next); return;}
    try {
      const nextRun = runWithEditedText(next);
      batch(() => {setRun(nextRun); setEditor(next);});
    } catch(cause) {
      setEditor(state => ({...state, error: cause instanceof Error ? cause.message : 'Не удалось изменить сообщение.'}));
    }
  }
  function select(stepId: string) {
    if(run()) return;
    finishText();
    setEditor(state => state.document.steps[stepId] ? {...state, selectedStepId: stepId} : state);
  }
  function undo() { manual(); finishText(); setEditor(core.undo); }
  function exitTest() {
    if(!disposed) finishText();
    setRunTextEdit(null);
    setRun(null); // Invalidate before timer cancellation.
    clearTimeout(replyTimer);
  }
  function replaceRun(next: ReturnType<typeof core.startRun>) {
    setRun(next); // New identity invalidates the previous timer without unmounting the composer.
    clearTimeout(replyTimer);
  }
  function startTest(stepId?: string) {
    if(disposed) return;
    cancelAi('AI-запрос отменён при входе в тест.');
    finishText();
    try {
      const nextRun = core.startRun(editor().document, id('run'), now(), stepId);
      replaceRun(nextRun);
    } catch(error) {setNotice(error instanceof Error ? error.message : 'Не удалось начать прохождение.');}
  }
  function acceptRunUpdate(current: ReturnType<typeof core.startRun>, next: ReturnType<typeof core.startRun>) {
    setRun(next); // Replace pending identity before canceling its timer.
    if(next.pending !== current.pending) {
      clearTimeout(replyTimer);
      if(!next.pending) return;
      const runId = next.id;
      const pendingId = next.pending.id;
      replyTimer = setTimeout(() => {
        if(!disposed) setRun(value => core.finishReply(value, runId, pendingId, now()));
      }, Math.max(0, next.pending.dueAt - now()));
    }
  }
  function jumpTest(stepId: string): boolean {
    if(disposed) return false;
    finishText();
    if(runTextEdit()) return false;
    const current = run();
    if(!current) return false;
    const next = core.jumpRun(current, stepId, now());
    acceptRunUpdate(current, next);
    return next.messages.length > current.messages.length;
  }
  function activate(messageId: string, buttonId: string) {
    if(disposed || runTextEdit()) return;
    const current = run();
    if(!current) return;
    acceptRunUpdate(current, core.activate(current, messageId, buttonId, now()));
  }
  function sendText(text: string): boolean {
    if(disposed || runTextEdit()) return false;
    const current = run();
    if(!current) return false;
    const next = core.sendText(current, current.id, id('text'), text, now());
    acceptRunUpdate(current, next);
    return next.messages.length > current.messages.length;
  }
  function demoCandidate(document: ShellDocument, demo: Demo): ShellDocument {
    const candidate = structuredClone(document);
    const entry = candidate.entryStepId;
    if(demo === 'greeting') {
      candidate.content.messages[candidate.steps[entry].messageIds[0]] = 'Привет! Здесь можно познакомиться с проектом, выбрать интересную тему и посмотреть материал.\n\nС чего начнём?';
    } else {
      const stepId = id('screen');
      const messageId = id('message');
      const buttonId = id('button');
      const returnId = id('button');
      const rowId = id('row');
      const newRowId = id('row');
      candidate.folders[core.stepFolderId(candidate, entry)].stepIds.push(stepId);
      if(candidate.nextStepNumber > ShellLimits.stepNumber) throw new Error('Закончились доступные номера экранов.');
      candidate.steps[stepId] = {number: candidate.nextStepNumber, messageIds: [messageId]};
      candidate.nextStepNumber++;
      candidate.messages[messageId] = {rows: [{id: newRowId, buttonIds: [returnId]}]};
      const added = demo === 'detail'
        ? {title: 'Подробнее о проекте', text: 'Здесь — история проекта: для кого он создан, какую задачу решает и чем полезен.\n\nНажмите значок карандаша справа от сообщения и добавьте свои факты.'}
        : {title: 'Ещё один путь', text: 'Это дополнительный раздел вашего бота. Добавьте сюда полезную информацию и настройте кнопки продолжения.'};
      candidate.content.steps[stepId] = {title: added.title};
      candidate.content.messages[messageId] = added.text;
      candidate.buttons[buttonId] = {targetStepId: stepId, color: 'default'};
      candidate.buttons[returnId] = {targetStepId: entry, color: 'default'};
      candidate.content.buttons[buttonId] = demo === 'detail' ? 'О проекте' : 'Другой раздел';
      candidate.content.buttons[returnId] = 'В начало';
      candidate.messages[candidate.steps[entry].messageIds.at(-1)!].rows.push({id: rowId, buttonIds: [buttonId]});
    }
    return core.validateDocument(candidate);
  }
  async function applyAi(prompt: string, demo: Demo | null) {
    if(ai() || run() || disposed) return;
    finishText();
    if(!prompt.trim()) { setNotice('Опишите изменение или выберите демонстрацию.'); return; }
    if(!demo && !options.aiAdapter) {
      setNotice('AI-адаптер не подключён. Запрос сохранён в поле. Ниже доступны три локальные демонстрации.');
      return;
    }
    const state = editor();
    const requestId = id('request');
    const abort = new AbortController();
    const timer = setTimeout(() => {
      if(ai()?.id === requestId) cancelAi('Время ожидания истекло. Документ не изменён.');
    }, ShellLimits.aiTimeoutMs);
    setAi({id: requestId, baseRevision: state.revision, documentId: state.document.id, controller: abort, timer});
    setNotice('');
    try {
      const snapshot = structuredClone(state.document);
      const result = demo
        ? await Promise.resolve({candidate: demoCandidate(snapshot, demo)})
        : await options.aiAdapter!.apply({requestId, documentId: snapshot.id, baseRevision: state.revision, prompt, document: snapshot, signal: abort.signal});
      const active = ai();
      if(disposed || active?.id !== requestId || editor().revision !== active.baseRevision || editor().document.id !== active.documentId) return;
      const candidate = core.validateDocument(result.candidate);
      if(candidate.id !== active.documentId) throw new Error('AI не может заменить идентификатор документа.');
      const previous = editor();
      const next = core.replaceDocument(previous, candidate, active.baseRevision);
      setNotice(next.error ?? (demo ? 'Локальный пример применён. Изменение можно отменить.' : 'Изменение применено. Его можно отменить.'));
      setEditor(next);
    } catch(error) {
      if(ai()?.id === requestId) setNotice(error instanceof Error ? error.message : 'Не удалось применить изменение.');
    } finally {
      if(ai()?.id === requestId) { clearTimeout(timer); setAi(null); }
    }
  }
  function exportSnapshot() {
    if(disposed) throw new Error('Сессия редактора завершена.');
    finishText();
    const captured = editor();
    const json = core.serializeDocument(core.validateDocument(captured.document));
    setExportRevision(captured.revision);
    return {json, revision: captured.revision, filename: `bot-${captured.document.id}.json`};
  }
  function dispose() { disposed = true; exitTest(); cancelAi(); }
  return {editor, run, runTextEdit, ai, notice, exportRevision, setNotice, dismissNotice, id, select, beginNewMessage, beginText, beginRunText, inputText, finishText, mutate, applyRunKeyboard, renameStep, undo, manual, startTest, jumpTest, exitTest, activate, sendText, applyAi, cancelAi, exportSnapshot, dispose};
}
export type Controller = ReturnType<typeof createController>;

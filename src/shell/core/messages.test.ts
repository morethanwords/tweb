import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {serializeDocument, validateDocument} from './document';
import {beginTextEdit, command, createEditor, finishTextEdit, inputText, keyboardDraft, undo} from './editor';
import {activate, activationReadiness, finishReply, messageText, pendingMessageCount, sendText, startRun, jumpRun, textReadiness} from './simulator';
import {isTerminalStep, stepReadiness, stepSummary, stepText} from './navigation';
import {ShellLimits, type ShellDocument} from './types';

function append(document: ShellDocument, stepId: string, messageId: string, text: string): void {
  document.steps[stepId].messageIds.push(messageId);
  document.messages[messageId] = {rows: []};
  document.content.messages[messageId] = text;
}

function multi() {
  const document = createFixture();
  append(document, 'start', 'start-second', 'Ещё одно приветствие');
  append(document, 'offer', 'offer-second', 'Содержание предложения');
  append(document, 'offer', 'offer-third', 'Продолжение по кнопке');
  return document;
}

describe('authored message ownership', () => {
  it('has one canonical text location, stable IDs and deterministic export in explicit message order', () => {
    const document = multi();
    const validated = validateDocument(document);
    expect(validated.schemaVersion).toBe(5);
    expect(validated.content.steps.start).toEqual({title: 'Знакомство'});
    expect(validated.steps.start.messageIds).toEqual(['start-message', 'start-second']);
    expect(stepText(validated, 'start')).toBe(document.content.messages['start-message'] + '\n\nЕщё одно приветствие');
    const shuffled = {...document, content: {...document.content, messages: Object.fromEntries(Object.entries(document.content.messages).reverse())}};
    expect(serializeDocument(shuffled)).toBe(serializeDocument(validated));
    validated.steps.start.messageIds.reverse();
    expect(document.steps.start.messageIds[0]).toBe('start-message');
  });

  it('rejects shared, missing, orphaned and zero-message screens without partial normalization', () => {
    const cases = [
      (doc: ShellDocument) => {doc.steps.start.messageIds = [];},
      (doc: ShellDocument) => {doc.steps.start.messageIds.push('start-message');},
      (doc: ShellDocument) => {doc.steps.offer.messageIds.push('start-message');},
      (doc: ShellDocument) => {doc.steps.start.messageIds.push('missing');},
      (doc: ShellDocument) => {doc.content.messages.orphan = 'Unowned';},
      (doc: ShellDocument) => {delete doc.content.messages['start-message'];}
    ];
    for(const change of cases) {const doc = multi(); change(doc); expect(() => validateDocument(doc)).toThrow();}
  });

  it('accepts exactly ten messages per screen and 500 overall, then rejects the next authored message', () => {
    const document = createFixture();
    document.folderOrder = ['main']; document.folders = {main: {stepIds: [], fallbackStepId: 's49'}}; document.content.folders = {main: {title: 'Main'}}; document.steps = {}; document.messages = {}; document.buttons = {};
    document.content.steps = {}; document.content.messages = {}; document.content.buttons = {};
    for(let step = 0; step < 50; step++) {
      const stepId = `s${step}`;
      if(step < 49) document.folders.main.stepIds.push(stepId); document.steps[stepId] = {number: step + 1, messageIds: []};
      document.content.steps[stepId] = {title: stepId};
      for(let index = 0; index < 10; index++) append(document, stepId, `m${step}-${index}`, `Сообщение ${index}`);
    }
    document.entryStepId = 's0';
    document.nextStepNumber = 51;
    expect(Object.keys(validateDocument(document).content.messages)).toHaveLength(500);
    const extra = structuredClone(document); append(extra, 's0', 'one-too-many', 'Extra');
    expect(() => validateDocument(extra)).toThrow();
    const perStep = createFixture();
    for(let index = 1; index <= 9; index++) append(perStep, 'start', `a${index}`, 'Text');
    expect(validateDocument(perStep).steps.start.messageIds).toHaveLength(10);
    append(perStep, 'start', 'a10', 'Text'); expect(() => validateDocument(perStep)).toThrow();
  });

  it('draft emptiness is explicit and blocks an entire batch including later empty messages', () => {
    const document = multi(); document.content.messages['start-second'] = ' ';
    expect(validateDocument(document).content.messages['start-second']).toBe(' ');
    expect(stepReadiness(document, 'start')).toContain('Сообщение 2');
    expect(() => startRun(document, 'empty', 0)).toThrow(/Сообщение 2/);
    document.messages['start-message'].rows = [];
    for(const id of ['start-offer', 'start-menu']) {delete document.buttons[id]; delete document.content.buttons[id];}
    expect(isTerminalStep(document, 'start')).toBe(false);
    expect(stepSummary(document, 'start').preview).toContain('Привет');
  });

  it('adds, edits and deletes by authored identity as independent undoable operations', () => {
    let state = createEditor(createFixture());
    state = command(state, {type: 'add_message', stepId: 'start', messageId: 'extra', afterMessageId: 'start-message', text: ''}, state.revision);
    expect(state.document.steps.start.messageIds).toEqual(['start-message', 'extra']);
    const before = state.document.content.messages['start-message'];
    state = inputText(beginTextEdit(state, 'start', 'extra'), 'Второе сообщение');
    state = finishTextEdit(state);
    expect(state.document.content.messages['start-message']).toBe(before);
    const edited = state;
    state = command(state, {type: 'delete_message', stepId: 'start', messageId: 'start-message'}, state.revision);
    expect(state.document.steps.start.messageIds).toEqual(['extra']);
    expect(state.document.content.messages['start-message']).toBeUndefined();
    expect(state.document.buttons['start-offer']).toBeUndefined();
    expect(state.document.buttons['start-menu']).toBeUndefined();
    expect(undo(state).document).toEqual(edited.document);
    const rejected = command(state, {type: 'delete_message', stepId: 'start', messageId: 'extra'}, state.revision);
    expect(rejected.document).toBe(state.document); expect(rejected.error).toContain('хотя бы одно');
    expect(command(state, {type: 'set_message_text', stepId: 'offer', messageId: 'extra', text: 'Steal'}, state.revision).document).toBe(state.document);
    expect(command(state, {type: 'add_message', stepId: 'start', messageId: 'new', afterMessageId: 'missing', text: 'Bad'}, state.revision).document).toBe(state.document);
  });

  it('preserves selected message sessions and copy while a whole screen is deleted or restored', () => {
    let state = createEditor(createFixture());
    state = command(state, {type: 'add_step', stepId: 'extra', messageId: 'first', afterStepId: 'start', content: {title: 'Extra', text: 'First'}}, state.revision);
    state = command(state, {type: 'add_message', stepId: 'extra', messageId: 'second', afterMessageId: 'first', text: 'Second'}, state.revision);
    const before = state;
    state = command(state, {type: 'delete_step', stepId: 'extra'}, state.revision);
    expect(state.document.content.messages.first).toBeUndefined(); expect(state.document.content.messages.second).toBeUndefined();
    expect(undo(state).document).toEqual(before.document);
  });

  it('validates colors strictly and retains color, label and target through keyboard movement and undo', () => {
    const original = createEditor(createFixture());
    const draft = keyboardDraft(original.document, 'start', 'start-message');
    draft.buttons['start-offer'].color = 'green'; draft.rows[0].buttonIds.reverse();
    const edited = command(original, {type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard: draft}, original.revision);
    expect(edited.error).toBeNull(); expect(edited.document.buttons['start-offer']).toEqual({targetStepId: 'offer', color: 'green'});
    expect(JSON.parse(serializeDocument(edited.document)).buttons['start-offer'].color).toBe('green');
    expect(undo(edited).document).toEqual(original.document);
    for(const color of [undefined, 'purple', '#ff0000', {value: 'green'}]) {
      const candidate = structuredClone(edited.document);
      Object.assign(candidate.buttons['start-offer'], {color});
      expect(() => validateDocument(candidate)).toThrow();
    }
  });
});

describe('atomic multi-message visitor batches', () => {
  it('starts and transitions in order with the final anchor and live keyboards throughout the latest batch', () => {
    const run = startRun(multi(), 'batch', 0);
    expect(run.messages.map(message => messageText(run, message))).toEqual([run.document.content.messages['start-message'], 'Ещё одно приветствие']);
    expect(run.activeMessageId).toBe(run.messages[1].id);
    const pending = activate(run, run.messages[0].id, 'start-offer', 1);
    expect(pending.phase).toBe('waiting');
    expect(pendingMessageCount(pending)).toBe(3); expect(pending.messages).toHaveLength(3);
    const completed = finishReply(pending, run.id, pending.pending!.id, 351)!;
    expect(completed.messages.slice(-3).map(message => message.kind === 'bot' ? message.messageId : null)).toEqual(['offer-message', 'offer-second', 'offer-third']);
    expect(completed.activeMessageId).toBe(completed.messages.at(-1)!.id);
    expect(finishReply(completed, run.id, pending.pending!.id, 1000)).toBe(completed);
    expect(new Set(completed.messages.map(message => message.id)).size).toBe(6);
  });

  it('rejects unknown visitor input while a full multi-message reply is pending', () => {
    const initial = startRun(multi(), 'batch', 0);
    const run = activate(initial, initial.messages[0].id, 'start-offer', 0);
    const rejected = sendText(run, run.id, 'question', 'Keep my input', 200);
    expect(rejected.messages).toBe(run.messages); expect(rejected.pending).toBe(run.pending);
    expect(rejected.error).toContain('Дождитесь'); expect(pendingMessageCount(run)).toBe(3);
    const completed = finishReply(rejected, run.id, run.pending!.id, 350)!;
    expect(completed.messages).toHaveLength(6);
    expect(completed.messages.slice(-3).every(message => message.kind === 'bot')).toBe(true);
  });

  it('refuses an oversized target independently while a smaller branch still fits', () => {
    let run = startRun(multi(), 'batch', 0);
    for(let index = 0; index < 195; index++) run = jumpRun(run, 'menu', index);
    run = jumpRun(run, 'start', 197);
    expect(run.messages).toHaveLength(199); expect(run.phase).toBe('ready');
    expect(activationReadiness(run, run.messages.at(-2)!.id, 'start-offer')).toContain('не хватает');
    const rejected = activate(run, run.messages.at(-2)!.id, 'start-offer', 200);
    expect(rejected.messages).toBe(run.messages); expect(rejected.phase).toBe('ready');
    expect(activationReadiness(run, run.messages.at(-2)!.id, 'start-menu')).toBeNull();
    expect(activate(rejected, run.messages.at(-2)!.id, 'start-menu', 200).phase).toBe('waiting');
    expect(textReadiness(run, '/start')).toContain('лимит');
  });

  it('/start replaces a larger old batch reservation with the pinned entry batch without losing history', () => {
    const run = startRun(multi(), 'batch', 0);
    const pending = activate(run, run.messages.find(message => message.kind === 'bot' && message.messageId === 'start-message')!.id, 'start-offer', 0);
    const command = sendText(pending, run.id, 'start-command', '/start', 100);
    expect(command.messages).toHaveLength(4); expect(pendingMessageCount(command)).toBe(2);
    expect(finishReply(command, run.id, pending.pending!.id, 350)).toBe(command);
    const completed = finishReply(command, run.id, command.pending!.id, 450)!;
    expect(completed.messages).toHaveLength(6);
    expect(completed.messages.slice(-2).map(message => message.kind === 'bot' ? message.messageId : null)).toEqual(['start-message', 'start-second']);
    expect(completed.messages.slice(0, 3)).toEqual(pending.messages);
  });
});

describe('explicit author navigation during Test', () => {
  it('starts from an override without changing global entry and /start still opens that global entry', () => {
    const document = multi(); const run = startRun(document, 'jump', 0, 'offer');
    expect(run.messages).toHaveLength(3); expect(run.messages.every(message => message.stepId === 'offer')).toBe(true);
    expect(run.document.entryStepId).toBe('start'); expect(document.entryStepId).toBe('start');
    const pending = sendText(run, run.id, 'start', '/start', 10);
    const completed = finishReply(pending, run.id, pending.pending!.id, 360)!;
    expect(completed.messages.slice(-2).every(message => message.stepId === 'start')).toBe(true);
    expect(() => startRun(document, 'bad', 0, 'missing')).toThrow();
  });

  it('appends an immediate complete batch, retires old keyboards and invalidates an older pending reply', () => {
    const original = startRun(multi(), 'jump', 0);
    const pending = activate(original, original.messages[0].id, 'start-menu', 10);
    const jumped = jumpRun(pending, 'offer', 100);
    expect(jumped.messages).toHaveLength(6); expect(jumped.messages.slice(0, 3)).toEqual(pending.messages);
    expect(jumped.messages.slice(-3).every(message => message.kind === 'bot' && message.stepId === 'offer' && message.at === 100)).toBe(true);
    expect(jumped.pending).toBeNull(); expect(jumped.activeMessageId).toBe(jumped.messages.at(-1)!.id);
    expect(finishReply(jumped, original.id, pending.pending!.id, 500)).toBe(jumped);
    expect(activate(jumped, original.activeMessageId, 'start-menu', 501)).toBe(jumped);
    expect(jumpRun(jumped, 'offer', 600).messages).toHaveLength(9);
  });

  it('rejected jumps preserve the pending reply and never append half a screen', () => {
    let run = startRun(multi(), 'jump', 0);
    for(let i = 0; i < 195; i++) run = jumpRun(run, 'menu', i);
    run = jumpRun(run, 'start', 197);
    run = activate(run, run.messages.at(-2)!.id, 'start-menu', 200);
    const rejected = jumpRun(run, 'offer', 201);
    expect(rejected.messages).toBe(run.messages); expect(rejected.pending).toBe(run.pending);
    expect(jumpRun(run, 'missing', 201).messages).toBe(run.messages);
    expect(jumpRun(run, 'menu', 199).messages).toBe(run.messages);
    expect(jumpRun(run, 'menu', 201).messages).toHaveLength(ShellLimits.messages);
  });
});

describe('readiness after selected-screen starts and explicit Test editing', () => {
  it('/start refuses an incomplete global entry even if the selected initial screen is valid', () => {
    const document = multi(); document.content.messages['start-second'] = '';
    const run = startRun(document, 'partial-entry', 0, 'offer');
    const issue = textReadiness(run, '/start');
    expect(issue).toContain('Начальный экран: Сообщение 2');
    const rejected = sendText(run, run.id, 'start', '/start', 1);
    expect(rejected.messages).toBe(run.messages); expect(rejected.pending).toBeNull(); expect(rejected.error).toBe(issue);
    expect(sendText(run, run.id, 'start-addressed', '/start@MyAIBot', 1).messages).toBe(run.messages);
  });

  it('retires a pending batch made incomplete by an explicit edit without appending any of it', () => {
    const run = startRun(multi(), 'edited-pending', 0);
    const pending = activate(run, run.messages.find(message => message.kind === 'bot' && message.messageId === 'start-message')!.id, 'start-offer', 1);
    const edited = {...pending, document: structuredClone(pending.document)};
    edited.document.content.messages['offer-second'] = '';
    const stopped = finishReply(edited, run.id, pending.pending!.id, 351)!;
    expect(stopped.messages).toBe(pending.messages); expect(stopped.activeMessageId).toBe(run.activeMessageId);
    expect(stopped.pending).toBeNull(); expect(stopped.phase).toBe('ready');
    expect(stopped.error).toContain('Ответ не отправлен: Сообщение 2');
    expect(finishReply(stopped, run.id, pending.pending!.id, 500)).toBe(stopped);
    expect(jumpRun(stopped, 'menu', 501).messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'menu'});
    const restart = sendText(stopped, run.id, 'start', '/start', 501);
    expect(restart.pending?.id).not.toBe(pending.pending!.id);
    expect(finishReply(restart, run.id, restart.pending!.id, 851)!.messages.slice(-2).every(message => message.stepId === 'start')).toBe(true);
  });
});

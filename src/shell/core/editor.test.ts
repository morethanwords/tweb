import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {serializeDocument} from './document';
import {beginNewMessage, beginTextEdit, command, createEditor, deletionReason, finishTextEdit, inputText, keyboardDraft, replaceDocument, undo} from './editor';
import {allStepIds} from './navigation';
import {ShellLimits} from './types';
import type {DocumentCommand, EditorState} from './types';

function apply(state: EditorState, operation: DocumentCommand): EditorState {
  return command(state, operation, state.revision);
}

describe('editor transactions', () => {
  it('detaches input and creates no initial history', () => {
    const document = createFixture();
    const state = createEditor(document);
    document.content.messages['start-message'] = 'Changed outside';
    expect(state.document.content.messages['start-message']).not.toBe('Changed outside');
    expect(state).toMatchObject({revision: 0, selectedStepId: 'start', history: [], textEdit: null, error: null, changed: false});
  });

  it('groups immediate text inputs into one undo transaction with monotonic revision', () => {
    const original = createEditor(createFixture());
    let state = beginTextEdit(original, 'start', 'start-message');
    state = inputText(state, 'Первый ввод');
    state = inputText(state, 'Первая строка\nВторая 👩🏽‍💻');
    expect(state.revision).toBe(2);
    expect(state.history).toHaveLength(0);
    expect(original.document.content.messages['start-message']).not.toBe(state.document.content.messages['start-message']);
    state = finishTextEdit(state);
    expect(state.revision).toBe(2);
    expect(state.history).toHaveLength(1);
    state = undo(state);
    expect(state.document).toEqual(original.document);
    expect(state.revision).toBe(3);
    expect(state.history).toHaveLength(0);
  });

  it('cancels a text session without adding undo or dropping earlier history', () => {
    let state = createEditor(createFixture());
    state = apply(state, {type: 'set_message_text', stepId: 'offer', messageId: 'offer-message', text: 'Правка до ввода'});
    const before = state;
    state = inputText(beginTextEdit(state, 'start', 'start-message'), 'Передумал');
    state = finishTextEdit(state, true);
    expect(state.document).toEqual(before.document);
    expect(state.history).toEqual(before.history);
    expect(state.revision).toBe(3);
    expect(state.textEdit).toBeNull();
  });

  it('finish and cancel with no real change create no revision or history', () => {
    const original = createEditor(createFixture());
    const editing = beginTextEdit(original, 'start', 'start-message');
    expect(inputText(editing, original.document.content.messages['start-message']).revision).toBe(0);
    expect(finishTextEdit(editing).history).toHaveLength(0);
    expect(finishTextEdit(editing, true).revision).toBe(0);
  });

  it('text restored by typing does not create a redundant undo record', () => {
    const original = createEditor(createFixture());
    let state = inputText(beginTextEdit(original, 'start', 'start-message'), 'Временный текст');
    state = inputText(state, original.document.content.messages['start-message']);
    state = finishTextEdit(state);
    expect(state.history).toHaveLength(0);
    expect(state.revision).toBe(2);
  });

  it('switching selected text finishes one session and preserves both independent edits', () => {
    let state = inputText(beginTextEdit(createEditor(createFixture()), 'start', 'start-message'), 'Старт');
    state = beginTextEdit(state, 'offer', 'offer-message');
    expect(state.history).toHaveLength(1);
    state = inputText(state, 'Предложение');
    state = finishTextEdit(state);
    expect(state.history).toHaveLength(2);
    expect(undo(state).document.content.messages['start-message']).toBe('Старт');
    expect(undo(state).document.content.messages['offer-message']).not.toBe('Предложение');
  });

  it('rejects invalid input without replacing working draft or losing active text session', () => {
    const state = inputText(beginTextEdit(createEditor(createFixture()), 'start', 'start-message'), 'Рабочий ввод');
    const failed = inputText(state, 'я'.repeat(ShellLimits.documentBytes));
    expect(failed.error).toBeTruthy();
    expect(failed.document).toBe(state.document);
    expect(failed.revision).toBe(state.revision);
    expect(failed.textEdit).toBe(state.textEdit);
    expect(inputText(failed, 'Повторить').error).toBeNull();
  });

  it('finishes live text before a valid structural command and undo reverses each operation separately', () => {
    const editing = inputText(beginTextEdit(createEditor(createFixture()), 'start', 'start-message'), 'Новый старт');
    const changed = apply(editing, {type: 'move_step', stepId: 'offer', index: 0});
    expect(changed.textEdit).toBeNull();
    expect(changed.history).toHaveLength(2);
    const firstUndo = undo(changed);
    expect(allStepIds(firstUndo.document)[0]).toBe('start');
    expect(firstUndo.document.content.messages['start-message']).toBe('Новый старт');
    expect(undo(firstUndo).document.content.messages['start-message']).not.toBe('Новый старт');
  });

  it('invalid structural operation leaves the current text transaction active', () => {
    const editing = inputText(beginTextEdit(createEditor(createFixture()), 'start', 'start-message'), 'Сохрани ввод');
    const failed = apply(editing, {type: 'set_entry', stepId: 'missing'});
    expect(failed.error).toBeTruthy();
    expect(failed.textEdit).toBe(editing.textEdit);
    expect(failed.history).toHaveLength(0);
    expect(failed.document).toBe(editing.document);
  });

  it('rejects stale manual and replacement operations after text input and undo', () => {
    const original = createEditor(createFixture());
    const changed = inputText(beginTextEdit(original, 'start', 'start-message'), 'Manual edit');
    const candidate = createFixture();
    candidate.content.messages['start-message'] = 'Late AI result';
    expect(replaceDocument(changed, candidate, original.revision)).toMatchObject({document: changed.document, revision: 1});
    expect(replaceDocument(changed, candidate, original.revision).error).toMatch(/Документ изменился/);
    const undone = undo(changed);
    expect(command(undone, {type: 'set_entry', stepId: 'menu'}, original.revision).error).toMatch(/Документ изменился/);
  });

  it('uses one guarded replacement boundary and records atomic valid replacement once', () => {
    const state = createEditor(createFixture());
    const candidate = createFixture();
    candidate.content.messages['offer-message'] = 'Новое предложение';
    candidate.content.buttons['offer-material'] = 'Хочу материал';
    const result = replaceDocument(state, candidate, state.revision);
    expect(result.revision).toBe(1);
    expect(result.history).toHaveLength(1);
    expect(result.error).toBeNull();
    expect(replaceDocument(result, candidate, state.revision).error).toBeTruthy();
    candidate.content.messages['offer-message'] = 'External mutation';
    expect(result.document.content.messages['offer-message']).toBe('Новое предложение');
    expect(undo(result).document).toEqual(state.document);
  });

  it('rejects identity replacement and broken graph atomically', () => {
    const state = createEditor(createFixture());
    expect(replaceDocument(state, {...createFixture(), id: 'different'}, 0).error).toMatch(/Идентификатор/);
    const candidate = createFixture();
    candidate.content.messages['start-message'] = 'Would otherwise change';
    candidate.buttons['start-offer'].transition = {type: 'screen', screenId: 'missing'};
    const failed = replaceDocument(state, candidate, 0);
    expect(failed.document).toBe(state.document);
    expect(failed.revision).toBe(0);
    expect(failed.history).toHaveLength(0);
  });

  it('no-op commands and identical candidate do not invalidate a pending AI base revision', () => {
    const state = createEditor(createFixture());
    expect(apply(state, {type: 'set_entry', stepId: 'start'}).revision).toBe(0);
    expect(apply(state, {type: 'move_step', stepId: 'start', index: 0}).history).toHaveLength(0);
    expect(replaceDocument(state, createFixture(), 0).revision).toBe(0);
  });

  it('adds a selected independent step, moves it and preserves existing button targets', () => {
    const original = createEditor(createFixture());
    let state = apply(original, {type: 'add_step', stepId: 'faq', messageId: 'faq-message', afterStepId: 'offer', content: {title: 'Вопросы', text: 'Ответы'}});
    expect(state.document.folders['start-folder'].stepIds).toEqual(['start', 'offer', 'faq', 'material']);
    expect(state.document.steps.faq.number).toBe(8);
    expect(state.document.nextStepNumber).toBe(9);
    expect(state.selectedStepId).toBe('faq');
    state = apply(state, {type: 'move_step', stepId: 'faq', index: 0});
    expect(allStepIds(state.document)[0]).toBe('faq');
    expect(state.document.steps.faq.number).toBe(8);
    expect(state.document.entryStepId).toBe('start');
    expect(state.document.buttons).toEqual(original.document.buttons);
  });

  it('never renumbers or reuses an issued screen number after deletion, reorder or undo', () => {
    const original = createEditor(createFixture());
    let state = apply(original, {type: 'add_step', stepId: 'six', messageId: 'six-message', afterStepId: 'offer', content: {title: 'Шестой', text: 'Текст'}});
    expect(state.document.steps.six.number).toBe(8);
    state = apply(state, {type: 'move_step', stepId: 'six', index: 0});
    expect(state.document.steps.six.number).toBe(8);
    state = apply(state, {type: 'delete_step', stepId: 'six'});
    expect(state.document.nextStepNumber).toBe(9);
    state = apply(state, {type: 'add_step', stepId: 'seven', messageId: 'seven-message', afterStepId: 'offer', content: {title: 'Седьмой', text: 'Текст'}});
    expect(state.document.steps.seven.number).toBe(9);

    const afterUndo = undo(apply(original, {type: 'add_step', stepId: 'temporary', messageId: 'temporary-message', afterStepId: 'offer', content: {title: 'Временный', text: 'Текст'}}));
    expect(afterUndo.document.steps.temporary).toBeUndefined();
    expect(afterUndo.document.nextStepNumber).toBe(9);
    const next = apply(afterUndo, {type: 'add_step', stepId: 'after-undo', messageId: 'after-undo-message', afterStepId: 'offer', content: {title: 'После отмены', text: 'Текст'}});
    expect(next.document.steps['after-undo'].number).toBe(9);
  });

  it('rejects AI candidates that renumber existing screens or reuse issued numbers', () => {
    const initial = createEditor(createFixture());
    const renumbered = structuredClone(initial.document);
    renumbered.steps.start.number = 9;
    renumbered.nextStepNumber = 10;
    expect(replaceDocument(initial, renumbered, initial.revision).document).toBe(initial.document);

    const issued = undo(apply(initial, {type: 'add_step', stepId: 'temporary', messageId: 'temporary-message', afterStepId: 'offer', content: {title: 'Временный', text: 'Текст'}}));
    const reused = structuredClone(issued.document);
    reused.folders['start-folder'].stepIds.push('reused');
    reused.steps.reused = {number: 8, blockIds: ['reused-message']};
    reused.blocks['reused-message'] = {id: 'reused-message', type: 'message', messageId: 'reused-message'};
    reused.messages['reused-message'] = {rows: []};
    reused.content.steps.reused = {title: 'Повтор'};
    reused.content.messages['reused-message'] = 'Текст';
    expect(replaceDocument(issued, reused, issued.revision).document).toBe(issued.document);
  });

  it('rejects duplicate and unsafe IDs and invalid insertion/move positions', () => {
    const state = createEditor(createFixture());
    expect(apply(state, {type: 'add_step', stepId: 'start', messageId: 'start-message', afterStepId: 'offer', content: {title: '', text: ''}}).error).toBeTruthy();
    expect(apply(state, {type: 'add_step', stepId: 'constructor', messageId: 'constructor-message', afterStepId: 'offer', content: {title: '', text: ''}}).error).toBeTruthy();
    expect(apply(state, {type: 'add_step', stepId: 'new', messageId: 'new-message', afterStepId: 'missing', content: {title: '', text: ''}}).error).toBeTruthy();
    for(const index of [-1, 5, 0.5, NaN]) expect(apply(state, {type: 'move_step', stepId: 'start', index}).error).toBeTruthy();
  });

  it('refuses entry and inbound step deletion without any implicit rewiring', () => {
    const state = createEditor(createFixture());
    expect(deletionReason(state.document, 'start')).toMatch(/начальный/);
    expect(deletionReason(state.document, 'offer')).toMatch(/ведут переходы/);
    expect(deletionReason(state.document, 'offer')).toContain('«Посмотреть материал» — 01 · Знакомство');
    expect(deletionReason(state.document, 'offer')).toContain('«О материале» — 05 · Меню');
    const result = apply(state, {type: 'delete_step', stepId: 'offer'});
    expect(result.document).toBe(state.document);
    expect(result.history).toHaveLength(0);
  });

  it('deletes an unreferenced step including its own self-loop atomically and undo restores selection validity', () => {
    let state = apply(createEditor(createFixture()), {type: 'add_step', stepId: 'extra', messageId: 'extra-message', afterStepId: 'menu', content: {title: 'Дополнительно', text: 'Текст'}});
    state = apply(state, {type: 'set_keyboard', stepId: 'extra', messageId: 'extra-message', keyboard: {
      rows: [{id: 'extra-row', buttonIds: ['extra-self']}], buttons: {'extra-self': {transition: {type: 'screen', screenId: 'extra'}, color: 'default'}}, labels: {'extra-self': 'Снова'}
    }});
    expect(deletionReason(state.document, 'extra')).toBeNull();
    state = apply(state, {type: 'delete_step', stepId: 'extra'});
    expect(state.document.steps.extra).toBeUndefined();
    expect(state.document.buttons['extra-self']).toBeUndefined();
    expect(state.document.content.buttons['extra-self']).toBeUndefined();
    expect(state.selectedStepId).toBe('menu');
    expect(undo(state).document.buttons['extra-self'].transition).toEqual({type: 'screen', screenId: 'extra'});
  });

  it('moves buttons across rows with labels and destinations intact; draft is detached', () => {
    const state = createEditor(createFixture());
    const draft = keyboardDraft(state.document, 'offer', 'offer-message');
    draft.rows[0].buttonIds.push(draft.rows[1].buttonIds.shift()!);
    draft.rows[0].buttonIds.reverse();
    draft.labels['offer-more'] = 'Подробнее';
    draft.buttons['offer-more'].transition = {type: 'screen', screenId: 'menu'};
    const result = apply(state, {type: 'set_keyboard', stepId: 'offer', messageId: 'offer-message', keyboard: draft});
    expect(result.error).toBeNull();
    expect(result.document.messages['offer-message'].rows[0].buttonIds).toEqual(['offer-more', 'offer-material']);
    expect(result.document.content.buttons['offer-more']).toBe('Подробнее');
    expect(result.document.buttons['offer-more'].transition).toEqual({type: 'screen', screenId: 'menu'});
    expect(result.document.steps.start).toEqual(state.document.steps.start);
    expect(state.document.buttons['offer-more'].transition).toEqual({type: 'screen', screenId: 'details'});
    draft.labels['offer-more'] = 'External';
    expect(result.document.content.buttons['offer-more']).toBe('Подробнее');
  });

  it('sets only a button target with revision safety, no-op detection and undo', () => {
    const original = createEditor(createFixture());
    const changed = apply(original, {type: 'set_button_transition', buttonId: 'start-offer', transition: {type: 'screen', screenId: 'details'}});
    expect(changed.error).toBeNull();
    expect(changed.revision).toBe(original.revision + 1);
    expect(changed.history).toHaveLength(1);
    expect(changed.document.buttons['start-offer']).toEqual({...original.document.buttons['start-offer'], transition: {type: 'screen', screenId: 'details'}});
    expect(changed.document.content.buttons).toEqual(original.document.content.buttons);
    expect(changed.document.messages).toEqual(original.document.messages);
    expect(undo(changed).document).toEqual(original.document);
    const unchanged = apply(original, {type: 'set_button_transition', buttonId: 'start-offer', transition: {type: 'screen', screenId: 'offer'}});
    expect(unchanged.revision).toBe(original.revision);
    expect(unchanged.history).toHaveLength(0);
    expect(command(original, {type: 'set_button_transition', buttonId: 'start-offer', transition: {type: 'screen', screenId: 'details'}}, 1).document).toBe(original.document);
    expect(apply(original, {type: 'set_button_transition', buttonId: 'missing', transition: {type: 'screen', screenId: 'details'}}).document).toBe(original.document);
    expect(apply(original, {type: 'set_button_transition', buttonId: 'start-offer', transition: {type: 'screen', screenId: 'missing'}}).document).toBe(original.document);
  });

  it('deletes the last keyboard row and all corresponding label/action data in one commit', () => {
    const state = createEditor(createFixture());
    const result = apply(state, {type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard: {rows: [], buttons: {}, labels: {}}});
    expect(result.error).toBeNull();
    expect(result.document.messages['start-message'].rows).toEqual([]);
    expect(result.document.buttons['start-offer']).toBeUndefined();
    expect(result.document.content.buttons['start-menu']).toBeUndefined();
    expect(undo(result).document).toEqual(state.document);
  });

  it('rejects stealing a sibling button, orphan labels and duplicate row IDs without mutating siblings', () => {
    const state = createEditor(createFixture());
    const stolen = keyboardDraft(state.document, 'offer', 'offer-message');
    stolen.rows[0].buttonIds.push('start-offer');
    stolen.buttons['start-offer'] = {transition: {type: 'screen', screenId: 'menu'}, color: 'default'};
    stolen.labels['start-offer'] = 'Stolen';
    expect(apply(state, {type: 'set_keyboard', stepId: 'offer', messageId: 'offer-message', keyboard: stolen}).error).toMatch(/другому сообщению/);
    const orphan = keyboardDraft(state.document, 'offer', 'offer-message');
    orphan.labels.orphan = 'Orphan';
    expect(apply(state, {type: 'set_keyboard', stepId: 'offer', messageId: 'offer-message', keyboard: orphan}).error).toBeTruthy();
    const duplicate = keyboardDraft(state.document, 'offer', 'offer-message');
    duplicate.rows[0].id = 'start-actions';
    const failed = apply(state, {type: 'set_keyboard', stepId: 'offer', messageId: 'offer-message', keyboard: duplicate});
    expect(failed.error).toBeTruthy();
    expect(failed.document).toBe(state.document);
  });

  it('unknown command fields are rejected', () => {
    const state = createEditor(createFixture());
    const result = command(state, {type: 'set_entry', stepId: 'menu', hidden: true} as unknown as DocumentCommand, 0);
    expect(result.error).toMatch(/поля команды/);
    expect(result.document).toBe(state.document);
  });

  it('bounds history by count and increments revision on every undo', () => {
    let state = createEditor(createFixture());
    for(let index = 0; index < 25; index++) {
      state = apply(state, {type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: `Изменение ${index}`});
    }
    expect(state.history).toHaveLength(ShellLimits.undoEntries);
    const revision = state.revision;
    for(let index = 0; index < 20; index++) state = undo(state);
    expect(state.revision).toBe(revision + 20);
    expect(state.document.content.messages['start-message']).toBe('Изменение 4');
    expect(undo(state).revision).toBe(state.revision);
  });

  it('also bounds aggregate history by bytes', () => {
    const document = createFixture();
    document.content.messages['start-message'] = 'я'.repeat(370_000);
    let state = createEditor(document);
    for(let index = 0; index < 14; index++) {
      state = apply(state, {type: 'set_message_text', stepId: 'offer', messageId: 'offer-message', text: `Изменение ${index}`});
    }
    expect(state.history.length).toBeLessThan(14);
    const bytes = state.history.reduce((total, item) => total + new TextEncoder().encode(serializeDocument(item)).byteLength, 0);
    expect(bytes).toBeLessThanOrEqual(ShellLimits.undoBytes);
    expect(state.document.content.messages['offer-message']).toBe('Изменение 13');
  });
});

describe('provisional authored-message creation', () => {
  it.each([
    ['untouched', []],
    ['whitespace', [' \n\t ']],
    ['type-then-clear', ['A useful message', '']]
  ] as const)('discards %s creation on blur without history or a dirty document', (_name, inputs) => {
    const original = createEditor(createFixture());
    let state = beginNewMessage(original, 'start', 'temporary');
    expect(state.document.steps.start.blockIds).toEqual(['start-message', 'temporary']);
    expect(state.history).toBe(original.history); expect(state.textEdit?.creation).toBeTruthy();
    for(const text of inputs) state = inputText(state, text);
    const revision = state.revision;
    state = finishTextEdit(state);
    expect(state.document).toEqual(original.document); expect(state.history).toBe(original.history);
    expect(state.revision).toBeGreaterThan(revision); expect(state.changed).toBe(false); expect(state.textEdit).toBeNull();
    expect(undo(state).document.content.messages.temporary).toBeUndefined();
  });

  it('Escape removes even a filled provisional message and preserves prior capped history exactly', () => {
    let original = createEditor(createFixture());
    for(let index = 0; index < 20; index++) original = command(original, {type: 'set_step_title', stepId: 'start', title: `Title ${index}`}, original.revision);
    const provisional = inputText(beginNewMessage(original, 'start', 'temporary'), 'Changed my mind');
    const canceled = finishTextEdit(provisional, true);
    expect(canceled.document).toEqual(original.document); expect(canceled.history).toBe(original.history);
    expect(canceled.history).toHaveLength(20); expect(canceled.changed).toBe(true);
    expect(canceled.revision).toBeGreaterThan(provisional.revision);
  });

  it('commits insertion and all text inputs as one undo operation with exact literal content', () => {
    const original = createEditor(createFixture());
    let state = beginNewMessage(original, 'start', 'new-message');
    state = inputText(state, 'Draft'); state = inputText(state, '  Полезное сообщение\nВторая строка  ');
    state = finishTextEdit(state);
    expect(state.history).toHaveLength(1); expect(state.history[0]).toEqual(original.document);
    expect(state.document.content.messages['new-message']).toBe('  Полезное сообщение\nВторая строка  ');
    expect(state.changed).toBe(true); expect(state.textEdit).toBeNull();
    const undone = undo(state);
    expect(undone.document).toEqual(original.document); expect(undone.history).toHaveLength(0);
    expect(undo(undone).document.content.messages['new-message']).toBeUndefined();
  });

  it('repeated Add discards the previous empty draft and never revives it when the next creation is undone', () => {
    const original = createEditor(createFixture());
    const first = beginNewMessage(original, 'start', 'first');
    expect(beginNewMessage(first, 'start', 'first').document).toBe(first.document);
    const second = beginNewMessage(first, 'start', 'second');
    expect(second.document.content.messages.first).toBeUndefined();
    expect(second.document.steps.start.blockIds).toEqual(['start-message', 'second']);
    const committed = finishTextEdit(inputText(second, 'Second message'));
    expect(committed.history).toHaveLength(1); expect(undo(committed).document).toEqual(original.document);
  });

  it('normal structural commands finish provisional cleanup before building a candidate or recording undo', () => {
    const original = createEditor(createFixture());
    const provisional = beginNewMessage(original, 'start', 'temporary');
    const changed = command(provisional, {type: 'set_step_title', stepId: 'start', title: 'Changed title'}, provisional.revision);
    expect(changed.error).toBeNull(); expect(changed.document.content.messages.temporary).toBeUndefined();
    expect(changed.document.content.steps.start.title).toBe('Changed title'); expect(changed.history).toHaveLength(1);
    expect(undo(changed).document).toEqual(original.document);
    expect(replaceDocument(provisional, provisional.document, provisional.revision).document).toEqual(original.document);
    const staleCandidate = structuredClone(provisional.document); staleCandidate.content.steps.start.title = 'Stale candidate';
    const rejected = replaceDocument(provisional, staleCandidate, provisional.revision);
    expect(rejected.error).toContain('Пустое новое сообщение'); expect(rejected.document).toBe(provisional.document);
    expect(rejected.history).toBe(original.history);
  });

  it('does not remove an existing authored message when its ordinary edit is emptied', () => {
    const original = createEditor(createFixture());
    const edited = finishTextEdit(inputText(beginTextEdit(original, 'start', 'start-message'), ''));
    expect(edited.document.steps.start.blockIds).toEqual(['start-message']);
    expect(edited.document.content.messages['start-message']).toBe(''); expect(edited.history).toHaveLength(1);
  });
});

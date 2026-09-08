import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {serializeDocument, validateDocument} from './document';
import {command, createEditor, deletionReason, keyboardDraft, undo} from './editor';
import {activate, finishReply, isActiveBotMessage, messageText, refreshRunPhase, sendText, startRun} from './simulator';
import {isTerminalStep, stepSummary} from './navigation';

function twoKeyboards() {
  const document = createFixture();
  document.steps.start.messageIds.push('second');
  document.messages.second = {rows: [{id: 'second-row', buttonIds: ['second-details']}]};
  document.content.messages.second = 'Дополнительное сообщение со своей кнопкой.';
  document.buttons['second-details'] = {targetStepId: 'details', color: 'green'};
  document.content.buttons['second-details'] = 'Подробнее';
  return document;
}

describe('message-owned keyboard document', () => {
  it('exports only message-owned keyboards and rejects legacy mixed step rows', () => {
    const document = twoKeyboards();
    expect(JSON.parse(serializeDocument(document)).messages.second.rows[0].buttonIds).toEqual(['second-details']);
    const mixed = structuredClone(document);
    Object.assign(mixed.steps.start, {rows: []});
    expect(() => validateDocument(mixed)).toThrow();
  });

  it('requires exactly one structure for each authored message and one owner for each row/button', () => {
    const missing = twoKeyboards(); delete missing.messages.second;
    expect(() => validateDocument(missing)).toThrow();
    const extra = twoKeyboards(); extra.messages.orphan = {rows: []};
    expect(() => validateDocument(extra)).toThrow();
    const duplicate = twoKeyboards(); duplicate.messages.second.rows[0].buttonIds.push('start-offer');
    expect(() => validateDocument(duplicate)).toThrow(/больше одного раза/);
    const rows = twoKeyboards(); rows.messages.second.rows[0].id = 'start-actions';
    expect(() => validateDocument(rows)).toThrow(/ряда уже используется/);
    expect(() => keyboardDraft(twoKeyboards(), 'offer', 'second')).toThrow(/не принадлежит/);
  });

  it('replaces only the requested message keyboard, preserves siblings and atomically removes owned data on message deletion', () => {
    const original = createEditor(twoKeyboards());
    const draft = keyboardDraft(original.document, 'start', 'second');
    draft.labels['second-details'] = 'Новая подпись'; draft.buttons['second-details'].color = 'red';
    const changed = command(original, {type: 'set_keyboard', stepId: 'start', messageId: 'second', keyboard: draft}, original.revision);
    expect(changed.error).toBeNull();
    expect(changed.document.messages['start-message']).toEqual(original.document.messages['start-message']);
    expect(changed.document.content.buttons['start-offer']).toBe(original.document.content.buttons['start-offer']);
    const stolen = keyboardDraft(changed.document, 'start', 'second');
    stolen.rows[0].buttonIds.push('start-offer'); stolen.buttons['start-offer'] = {...changed.document.buttons['start-offer']}; stolen.labels['start-offer'] = 'Stolen';
    expect(command(changed, {type: 'set_keyboard', stepId: 'start', messageId: 'second', keyboard: stolen}, changed.revision).document).toBe(changed.document);
    const removed = command(changed, {type: 'delete_message', stepId: 'start', messageId: 'second'}, changed.revision);
    expect(removed.document.messages.second).toBeUndefined(); expect(removed.document.buttons['second-details']).toBeUndefined();
    expect(removed.document.content.messages.second).toBeUndefined(); expect(removed.document.content.buttons['second-details']).toBeUndefined();
    expect(removed.document.buttons['start-offer']).toEqual(original.document.buttons['start-offer']);
    expect(undo(removed).document).toEqual(changed.document);
  });

  it('derives terminal status, missing destinations and deletion references from every message keyboard', () => {
    const document = twoKeyboards();
    document.messages['start-message'].rows = [];
    for(const id of ['start-offer', 'start-menu']) {delete document.buttons[id]; delete document.content.buttons[id];}
    expect(isTerminalStep(document, 'start')).toBe(false);
    expect(deletionReason(document, 'details')).toContain('Подробнее');
    document.buttons['second-details'].targetStepId = null;
    expect(stepSummary(document, 'start').unassigned).toBe(1);
    document.messages.second.rows = []; delete document.buttons['second-details']; delete document.content.buttons['second-details'];
    expect(isTerminalStep(document, 'start')).toBe(true);
  });
});

describe('latest screen batch keyboards', () => {
  it('lets either message act once, disables both during typing and retires all earlier batch occurrences', () => {
    const run = startRun(twoKeyboards(), 'batch-keyboards', 0);
    expect(run.activeMessageId).toBe(run.messages[1].id);
    expect(isActiveBotMessage(run, run.messages[0].id)).toBe(true); expect(isActiveBotMessage(run, run.messages[1].id)).toBe(true);
    const firstChoice = activate(run, run.messages[0].id, 'start-menu', 1);
    const secondChoice = activate(run, run.messages[1].id, 'second-details', 1);
    expect(firstChoice.pending).toMatchObject({targetStepId: 'menu'}); expect(secondChoice.pending).toMatchObject({targetStepId: 'details'});
    expect(activate(firstChoice, run.messages[1].id, 'second-details', 2)).toBe(firstChoice);
    const completed = finishReply(firstChoice, run.id, firstChoice.pending!.id, 351)!;
    expect(isActiveBotMessage(completed, run.messages[0].id)).toBe(false); expect(isActiveBotMessage(completed, run.messages[1].id)).toBe(false);
    const start = sendText(completed, run.id, 'start', '/start', 352);
    const returned = finishReply(start, run.id, start.pending!.id, 702)!;
    expect(returned.messages.slice(-2).every(message => isActiveBotMessage(returned, message.id))).toBe(true);
    expect(isActiveBotMessage(returned, run.messages[0].id)).toBe(false); expect(isActiveBotMessage(returned, 'missing')).toBe(false);
    expect(activate(returned, returned.messages.at(-2)!.id, 'second-details', 703)).toBe(returned);
  });

  it('keeps accepted action text and target intact after the source button is edited or deleted', () => {
    const run = startRun(twoKeyboards(), 'history', 0);
    const pending = activate(run, run.messages[0].id, 'start-offer', 1);
    const action = pending.messages.at(-1)!; const originalText = messageText(pending, action);
    const editor = createEditor(pending.document);
    const modified = keyboardDraft(editor.document, 'start', 'start-message');
    modified.labels['start-offer'] = 'Completely different label'; modified.buttons['start-offer'].targetStepId = 'details';
    const afterChange = command(editor, {type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard: modified}, editor.revision);
    const changedRun = refreshRunPhase({...pending, document: afterChange.document});
    expect(messageText(changedRun, action)).toBe(originalText); expect(changedRun.pending).toBe(pending.pending);
    const deleted = command(afterChange, {type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard: {rows: [], buttons: {}, labels: {}}}, afterChange.revision);
    const deletedRun = refreshRunPhase({...pending, document: deleted.document});
    expect(messageText(deletedRun, action)).toBe(originalText); expect(deletedRun.phase).toBe('waiting');
    const completed = finishReply(deletedRun, run.id, pending.pending!.id, 351)!;
    expect(completed.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'offer'}); expect(messageText(completed, action)).toBe(originalText);
  });
});

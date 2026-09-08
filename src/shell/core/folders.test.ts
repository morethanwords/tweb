import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {serializeDocument, validateDocument} from './document';
import {command, createEditor, deletionReason, folderDeletionReason, undo} from './editor';
import {allStepIds, folderStepIds, isFallbackStep, stepFolderId} from './navigation';
import {startRun} from './simulator';
import {ShellLimits, type DocumentCommand, type EditorState, type ShellDocument} from './types';

const addFolder = (): DocumentCommand => ({type: 'add_folder', folderId: 'extra-folder', title: 'Дополнительно',
  stepId: 'extra', messageId: 'extra-message', fallbackStepId: 'extra-fallback', fallbackMessageId: 'extra-fallback-message',
  rowId: 'extra-fallback-row', buttonId: 'extra-fallback-back'});
const apply = (state: EditorState, operation: DocumentCommand) => command(state, operation, state.revision);

function emptyMenuFolder(): EditorState {
  let state = createEditor(createFixture());
  for(const stepId of ['menu', 'details']) state = apply(state, {type: 'move_step_to_folder', stepId, folderId: 'start-folder'});
  return state;
}

function appendPlainStep(document: ShellDocument, stepId: string): void {
  document.folders['start-folder'].stepIds.push(stepId);
  document.steps[stepId] = {number: document.nextStepNumber++, blockIds: [`${stepId}-message`]};
  document.blocks[`${stepId}-message`] = {id: `${stepId}-message`, type: 'message', messageId: `${stepId}-message`};
  document.messages[`${stepId}-message`] = {rows: []}; document.content.messages[`${stepId}-message`] = 'Текст';
  document.content.steps[stepId] = {title: stepId};
}

describe('folder document ownership', () => {
  it('uses one folder order with implicit final fallback and retains all existing human screen numbers', () => {
    const document = createFixture();
    expect(document.schemaVersion).toBe(6);
    expect(folderStepIds(document, 'start-folder')).toEqual(['start', 'offer', 'material', 'start-fallback']);
    expect(folderStepIds(document, 'menu-folder')).toEqual(['menu', 'details', 'menu-fallback']);
    expect(allStepIds(document)).toEqual(['start', 'offer', 'material', 'start-fallback', 'menu', 'details', 'menu-fallback']);
    expect(['start', 'offer', 'details', 'material', 'menu', 'start-fallback', 'menu-fallback'].map(id => document.steps[id].number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(document.nextStepNumber).toBe(8);
    expect(stepFolderId(document, 'details')).toBe('menu-folder'); expect(stepFolderId(document, 'menu-fallback')).toBe('menu-folder');
    expect(isFallbackStep(document, 'menu-fallback')).toBe(true); expect(isFallbackStep(document, 'menu')).toBe(false);
    const order = folderStepIds(document, 'start-folder'); order.reverse();
    expect(document.folders['start-folder'].stepIds[0]).toBe('start');
    expect(() => stepFolderId(document, 'missing')).toThrow(); expect(() => folderStepIds(document, 'missing')).toThrow();
    const exported = JSON.parse(serializeDocument(document));
    expect(exported).not.toHaveProperty('stepOrder'); expect(exported).not.toHaveProperty('fallbacks'); expect(exported.content).not.toHaveProperty('fallbacks');
  });

  it('rejects legacy and mixed schema contracts instead of silently assigning fallback ownership', () => {
    for(const schemaVersion of [1, 2, 3, 4, 7]) expect(() => validateDocument({...createFixture(), schemaVersion})).toThrow(/версии 5 и 6/);
    for(const mutation of [
      (doc: ShellDocument) => Object.assign(doc, {stepOrder: allStepIds(doc)}),
      (doc: ShellDocument) => Object.assign(doc, {fallbacks: {message: 'ignore', command: 'ignore'}}),
      (doc: ShellDocument) => Object.assign(doc.content, {fallbacks: {message: '', command: ''}}),
      (doc: ShellDocument) => Object.assign(doc.folders['start-folder'], {owner: 'extra'}),
      (doc: ShellDocument) => Object.assign(doc.content.folders['start-folder'], {html: '<b>title</b>'})
    ]) {const doc = createFixture(); mutation(doc); expect(() => validateDocument(doc)).toThrow();}
  });

  it('requires exact folder maps and exactly one ordinary-or-fallback owner for every screen', () => {
    const cases = [
      (doc: ShellDocument) => {doc.folderOrder = [];},
      (doc: ShellDocument) => {doc.folderOrder.push('start-folder');},
      (doc: ShellDocument) => {delete doc.folders['menu-folder'];},
      (doc: ShellDocument) => {delete doc.content.folders['menu-folder'];},
      (doc: ShellDocument) => {doc.folders['start-folder'].stepIds.push('menu');},
      (doc: ShellDocument) => {doc.folders['start-folder'].stepIds.push('start-fallback');},
      (doc: ShellDocument) => {doc.folders['start-folder'].stepIds.pop();},
      (doc: ShellDocument) => {doc.folders['start-folder'].fallbackStepId = 'menu-fallback';},
      (doc: ShellDocument) => {doc.folders['start-folder'].fallbackStepId = 'missing';},
      (doc: ShellDocument) => {doc.entryStepId = 'start-fallback';}
    ];
    for(const change of cases) {const doc = createFixture(); change(doc); expect(() => validateDocument(doc)).toThrow();}
  });

  it('canonicalizes maps in folder and per-folder screen order, independently of insertion order', () => {
    const document = createFixture();
    const shuffled = structuredClone(document);
    shuffled.folders = Object.fromEntries(Object.entries(shuffled.folders).reverse());
    shuffled.content.folders = Object.fromEntries(Object.entries(shuffled.content.folders).reverse());
    shuffled.steps = Object.fromEntries(Object.entries(shuffled.steps).reverse());
    expect(serializeDocument(shuffled)).toBe(serializeDocument(document));
    shuffled.folderOrder.reverse();
    expect(Object.keys(validateDocument(shuffled).steps)[0]).toBe('menu');
    expect(shuffled.entryStepId).toBe('start'); expect(shuffled.steps.menu.number).toBe(5);
  });

  it('rejects unsafe folder IDs and accessor/sparse membership without evaluating accessors', () => {
    const unsafe = createFixture(); unsafe.folderOrder[0] = '__proto__';
    expect(() => validateDocument(unsafe)).toThrow();
    const sparse = createFixture(); delete sparse.folders['start-folder'].stepIds[1];
    expect(() => validateDocument(sparse)).toThrow();
    const getter = createFixture(); let reads = 0;
    Object.defineProperty(getter.folders['start-folder'], 'fallbackStepId', {get: () => {reads++; return 'start-fallback';}, enumerable: true});
    expect(() => validateDocument(getter)).toThrow(); expect(reads).toBe(0);
  });
});

describe('atomic folder commands', () => {
  it('creates a complete folder and fallback in one revision/undo transaction and rejects stale delivery', () => {
    const original = createEditor(createFixture()); const operation = addFolder();
    const created = apply(original, operation);
    expect(created.error).toBeNull(); expect(created.revision).toBe(1); expect(created.history).toHaveLength(1);
    expect(created.selectedStepId).toBe('extra');
    expect(folderStepIds(created.document, 'extra-folder')).toEqual(['extra', 'extra-fallback']);
    expect(created.document.steps.extra.number).toBe(8); expect(created.document.steps['extra-fallback'].number).toBe(9);
    expect(created.document.nextStepNumber).toBe(10);
    expect(created.document.buttons['extra-fallback-back'].transition).toEqual({type: 'screen', screenId: 'extra'});
    expect(() => startRun(created.document, 'new-folder', 0, 'extra')).not.toThrow();
    expect(command(created, operation, original.revision).document).toBe(created.document);
    expect(apply(created, operation).document).toBe(created.document);
    const undone = undo(created);
    expect(undone.document).toEqual({...original.document, nextStepNumber: 10});
    expect(undone.history).toHaveLength(0);
    const next = apply(undone, operation);
    expect(next.document.steps.extra.number).toBe(10); expect(next.document.steps['extra-fallback'].number).toBe(11);
  });

  it('renames a folder through the shared strict revision boundary and restores its title with one undo', () => {
    const original = createEditor(createFixture());
    const changed = apply(original, {type: 'set_folder_title', folderId: 'start-folder', title: 'Знакомство'});
    expect(changed.document.content.folders['start-folder'].title).toBe('Знакомство');
    expect(changed.document.folders).toEqual(original.document.folders); expect(changed.history).toHaveLength(1);
    expect(apply(changed, {type: 'set_folder_title', folderId: 'start-folder', title: 'Знакомство'}).revision).toBe(changed.revision);
    expect(undo(changed).document).toEqual(original.document);
    expect(apply(changed, {type: 'set_folder_title', folderId: 'missing', title: 'Fail'}).document).toBe(changed.document);
  });

  it('moves ordinary screens locally and between folders without renumbering, rewiring or reassigning fallback roles', () => {
    const original = createEditor(createFixture());
    const local = apply(original, {type: 'move_step', stepId: 'material', index: 0});
    expect(local.document.folders['start-folder'].stepIds).toEqual(['material', 'start', 'offer']);
    const moved = apply(local, {type: 'move_step_to_folder', stepId: 'start', folderId: 'menu-folder'});
    expect(moved.document.folders['start-folder'].stepIds).toEqual(['material', 'offer']);
    expect(folderStepIds(moved.document, 'menu-folder')).toEqual(['menu', 'details', 'start', 'menu-fallback']);
    expect(moved.document.entryStepId).toBe('start'); expect(moved.document.steps.start.number).toBe(1);
    expect(moved.document.buttons).toEqual(original.document.buttons);
    expect(moved.document.messages).toEqual(original.document.messages);
    expect(moved.document.content).toEqual(original.document.content);
    expect(apply(moved, {type: 'move_step_to_folder', stepId: 'start', folderId: 'menu-folder'}).revision).toBe(moved.revision);
    expect(undo(moved).document).toEqual(local.document);
  });

  it('inserts ordinary screens after an ordinary anchor or immediately before an empty folder fallback', () => {
    let state = emptyMenuFolder();
    state = apply(state, {type: 'add_step', stepId: 'first', messageId: 'first-message', afterStepId: 'menu-fallback', content: {title: 'Первый', text: ''}});
    expect(state.error).toBeNull(); expect(folderStepIds(state.document, 'menu-folder')).toEqual(['first', 'menu-fallback']);
    state = apply(state, {type: 'add_step', stepId: 'second', messageId: 'second-message', afterStepId: 'first', content: {title: 'Второй', text: ''}});
    expect(folderStepIds(state.document, 'menu-folder')).toEqual(['first', 'second', 'menu-fallback']);
    expect(state.document.steps['menu-fallback'].number).toBe(7);
  });

  it('blocks fallback deletion, movement and entry assignment with no partial changes', () => {
    const state = createEditor(createFixture());
    for(const operation of [
      {type: 'delete_step', stepId: 'start-fallback'},
      {type: 'move_step', stepId: 'start-fallback', index: 0},
      {type: 'move_step_to_folder', stepId: 'start-fallback', folderId: 'menu-folder'},
      {type: 'set_entry', stepId: 'start-fallback'},
      {type: 'move_step', stepId: 'start', index: 3},
      {type: 'move_step_to_folder', stepId: 'start', folderId: 'missing'}
    ] as DocumentCommand[]) {
      const rejected = apply(state, operation);
      expect(rejected.error).toBeTruthy(); expect(rejected.document).toBe(state.document); expect(rejected.history).toBe(state.history);
    }
    expect(deletionReason(state.document, 'start-fallback')).toContain('пустой папкой');
  });

  it('requires an empty ordinary list and clear inbound fallback references before deleting a folder', () => {
    const original = createEditor(createFixture());
    expect(folderDeletionReason(original.document, 'menu-folder')).toContain('обычные экраны');
    expect(apply(original, {type: 'delete_folder', folderId: 'menu-folder'}).document).toBe(original.document);
    const empty = emptyMenuFolder();
    expect(folderDeletionReason(empty.document, 'menu-folder')).toBeNull();
    const linked = structuredClone(empty.document); linked.buttons['start-offer'].transition = {type: 'screen', screenId: 'menu-fallback'};
    expect(folderDeletionReason(linked, 'menu-folder')).toContain('«Посмотреть материал» — 01');
    const blocked = createEditor(linked);
    expect(apply(blocked, {type: 'delete_folder', folderId: 'menu-folder'}).document).toBe(blocked.document);
    const deleted = apply({...empty, selectedStepId: 'menu-fallback'}, {type: 'delete_folder', folderId: 'menu-folder'});
    expect(deleted.error).toBeNull(); expect(deleted.selectedStepId).toBe('start');
    expect(deleted.document.folderOrder).toEqual(['start-folder']);
    expect(deleted.document.steps['menu-fallback']).toBeUndefined(); expect(deleted.document.messages['menu-fallback-message']).toBeUndefined();
    expect(deleted.document.buttons['menu-fallback-back']).toBeUndefined(); expect(deleted.document.content.buttons['menu-fallback-back']).toBeUndefined();
    expect(deleted.document.content.folders['menu-folder']).toBeUndefined();
    expect(undo(deleted).document).toEqual(empty.document);
    expect(apply(deleted, {type: 'delete_folder', folderId: 'start-folder'}).document).toBe(deleted.document);
  });

  it('rejects collisions and unknown command fields without consuming stable IDs or history', () => {
    const state = createEditor(createFixture());
    for(const update of [
      {folderId: 'start-folder'}, {folderId: 'constructor'}, {stepId: 'start'}, {fallbackStepId: 'extra'},
      {messageId: 'start-message'}, {fallbackMessageId: 'extra-message'}, {buttonId: 'start-offer'}, {rowId: 'start-actions'}, {extra: true}
    ]) {
      const rejected = apply(state, {...addFolder(), ...update} as DocumentCommand);
      expect(rejected.error).toBeTruthy(); expect(rejected.document).toBe(state.document); expect(rejected.history).toBe(state.history);
      expect(rejected.revision).toBe(state.revision); expect(rejected.document.nextStepNumber).toBe(8);
    }
  });

  it('counts both created screens against the existing 100-screen limit atomically', () => {
    const document = createFixture();
    for(let index = 7; index < 98; index++) appendPlainStep(document, `limit-${index}`);
    const original = createEditor(document); const full = apply(original, addFolder());
    expect(full.error).toBeNull(); expect(allStepIds(full.document)).toHaveLength(ShellLimits.steps);
    const nearFullDocument = structuredClone(document); appendPlainStep(nearFullDocument, 'ninety-nine');
    const nearFull = createEditor(nearFullDocument); const rejected = apply(nearFull, addFolder());
    expect(rejected.error).toContain('100'); expect(rejected.document).toBe(nearFull.document); expect(rejected.history).toBe(nearFull.history);
  });

  it('reserves two message slots and one button, and never half-creates a folder when a global limit is reached', () => {
    const messages = createFixture();
    for(let index = 7; index < 50; index++) appendPlainStep(messages, `limit-${index}`);
    for(const stepId of allStepIds(messages)) {
      for(let index = 1; index < 10; index++) {
        const id = `${stepId}-extra-${index}`;
        messages.steps[stepId].blockIds.push(id); messages.messages[id] = {rows: []}; messages.content.messages[id] = 'Текст';
        messages.blocks[id] = {id, type: 'message', messageId: id};
      }
    }
    const fullMessages = createEditor(messages);
    expect(Object.keys(fullMessages.document.messages)).toHaveLength(500);
    expect(apply(fullMessages, addFolder()).document).toBe(fullMessages.document);

    const buttons = createFixture(); let count = Object.keys(buttons.buttons).length;
    for(const structure of Object.values(buttons.messages)) {
      while(structure.rows.length < ShellLimits.rows && count < ShellLimits.buttons) {
        const row = {id: `extra-row-${count}`, buttonIds: [] as string[]}; structure.rows.push(row);
        for(let index = 0; index < ShellLimits.buttonsPerRow && count < ShellLimits.buttons; index++) {
          const id = `extra-button-${count++}`; row.buttonIds.push(id); buttons.buttons[id] = {transition: {type: 'screen', screenId: 'start'}, color: 'default'}; buttons.content.buttons[id] = 'Перейти';
        }
      }
    }
    for(let message = 0; count < ShellLimits.buttons; message++) {
      const messageId = `capacity-message-${message}`;
      buttons.steps.start.blockIds.push(messageId); buttons.messages[messageId] = {rows: []}; buttons.content.messages[messageId] = 'Текст';
      buttons.blocks[messageId] = {id: messageId, type: 'message', messageId};
      while(buttons.messages[messageId].rows.length < ShellLimits.rows && count < ShellLimits.buttons) {
        const row = {id: `extra-row-${count}`, buttonIds: [] as string[]}; buttons.messages[messageId].rows.push(row);
        for(let index = 0; index < ShellLimits.buttonsPerRow && count < ShellLimits.buttons; index++) {
          const id = `extra-button-${count++}`; row.buttonIds.push(id); buttons.buttons[id] = {transition: {type: 'screen', screenId: 'start'}, color: 'default'}; buttons.content.buttons[id] = 'Перейти';
        }
      }
    }
    const fullButtons = createEditor(buttons); expect(Object.keys(fullButtons.document.buttons)).toHaveLength(500);
    expect(apply(fullButtons, addFolder()).document).toBe(fullButtons.document);
  });

  it('needs two remaining screen numbers for folder creation without consuming the final available number on failure', () => {
    const document = createFixture(); document.nextStepNumber = ShellLimits.stepNumber;
    const state = createEditor(document); const failed = apply(state, addFolder());
    expect(failed.error).toContain('номера экранов'); expect(failed.document).toBe(state.document); expect(failed.history).toBe(state.history);
    expect(failed.document.nextStepNumber).toBe(ShellLimits.stepNumber);
  });
});

import {ShellLimits} from './types';
import type {DocumentCommand, EditorState, KeyboardDraft, ShellDocument} from './types';
import {documentBytes, serializeDocument, validId, validateDocument} from './document';
import {allStepIds, stepFolderId, isFallbackStep, stepReference, stepMessageIds, messageBlockId, documentTransitions} from './navigation';
import {FolderDefaults} from './defaults';

function error(state: EditorState, cause: unknown): EditorState {
  return {...state, error: cause instanceof Error ? cause.message : 'Не удалось применить изменение'};
}

function nextRevision(state: EditorState): number {
  if(!Number.isSafeInteger(state.revision) || state.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('Счётчик изменений исчерпан. Экспортируйте документ.');
  }
  return state.revision + 1;
}

function requireRevision(state: EditorState, expectedRevision: number): void {
  if(!Number.isSafeInteger(expectedRevision) || expectedRevision !== state.revision) {
    throw new Error('Документ изменился. Повторите действие на актуальной версии.');
  }
}

function requireStep(document: ShellDocument, stepId: string): void {
  if(!Object.hasOwn(document.steps, stepId)) throw new Error('Шаг больше не существует.');
}

function requireFolder(document: ShellDocument, folderId: string): void {
  if(!Object.hasOwn(document.folders, folderId)) throw new Error('Папка больше не существует.');
}

function addScreenData(document: ShellDocument, stepId: string, messageId: string, content: {title: string; text: string}): void {
  validId(stepId, 'stepId'); validId(messageId, 'messageId');
  if(Object.hasOwn(document.steps, stepId)) throw new Error('Идентификатор шага уже используется.');
  if(Object.hasOwn(document.messages, messageId)) throw new Error('Идентификатор сообщения уже используется.');
  if(document.nextStepNumber > ShellLimits.stepNumber) throw new Error('Закончились доступные номера экранов.');
  document.steps[stepId] = {number: document.nextStepNumber++, blockIds: [messageId]};
  if(Object.hasOwn(document.blocks, messageId)) throw new Error('Идентификатор блока уже используется.');
  document.blocks[messageId] = {id: messageId, type: 'message', messageId};
  document.messages[messageId] = {rows: []};
  document.content.steps[stepId] = {title: content.title};
  document.content.messages[messageId] = content.text;
}

function removeScreenData(document: ShellDocument, stepId: string): void {
  for(const id of document.steps[stepId].blockIds) {
    const block = document.blocks[id];
    if(block.type === 'message' || block.type === 'ask') removeMessageData(document, block.messageId);
    delete document.blocks[id];
  }
  delete document.steps[stepId]; delete document.content.steps[stepId];
}

function requireMessage(document: ShellDocument, stepId: string, messageId: string): void {
  requireStep(document, stepId);
  if(!stepMessageIds(document, stepId).includes(messageId)) throw new Error('Сообщение не принадлежит этому экрану.');
}

function removeMessageData(document: ShellDocument, messageId: string): void {
  for(const buttonId of document.messages[messageId].rows.flatMap(row => row.buttonIds)) {
    delete document.buttons[buttonId]; delete document.content.buttons[buttonId];
  }
  delete document.messages[messageId]; delete document.content.messages[messageId];
}

function appendHistory(history: ShellDocument[], document: ShellDocument): ShellDocument[] {
  const result = [...history, validateDocument(document)].slice(-ShellLimits.undoEntries);
  let bytes = result.reduce((total, item) => total + documentBytes(item), 0);
  while(bytes > ShellLimits.undoBytes && result.length) bytes -= documentBytes(result.shift()!);
  return result;
}

function equal(left: ShellDocument, right: ShellDocument): boolean {
  return serializeDocument(left) === serializeDocument(right);
}

function selection(document: ShellDocument, previous: string): string {
  return Object.hasOwn(document.steps, previous) ? previous : document.entryStepId;
}

function commandFields(value: object, expected: string[]): void {
  const actual = Reflect.ownKeys(value);
  if(actual.length !== expected.length || actual.some((key) => typeof key !== 'string' || !expected.includes(key))) {
    throw new Error('Неизвестные или отсутствующие поля команды.');
  }
}

export function createEditor(document: ShellDocument): EditorState {
  const detached = validateDocument(document);
  return {
    document: detached, revision: 0, selectedStepId: detached.entryStepId,
    history: [], textEdit: null, error: null, changed: false
  };
}

export function keyboardDraft(document: ShellDocument, stepId: string, messageId: string): KeyboardDraft {
  requireMessage(document, stepId, messageId);
  const rows = document.messages[messageId].rows.map((row) => ({id: row.id, buttonIds: [...row.buttonIds]}));
  const buttons: KeyboardDraft['buttons'] = {};
  const labels: KeyboardDraft['labels'] = {};
  for(const id of rows.flatMap((row) => row.buttonIds)) {
    buttons[id] = {...document.buttons[id]};
    labels[id] = document.content.buttons[id];
  }
  return {rows, buttons, labels};
}

function incomingReferences(document: ShellDocument, stepId: string): string[] {
  return documentTransitions(document)
    .filter(item => item.stepId !== stepId && item.transition.type === 'screen' && item.transition.screenId === stepId)
    .map(item => `${item.label} — ${stepReference(document, item.stepId)}`);
}

export function deletionReason(document: ShellDocument, stepId: string): string | null {
  if(!Object.hasOwn(document.steps, stepId)) return 'Шаг больше не существует.';
  if(stepId === document.entryStepId) return 'Сначала выберите другой начальный шаг.';
  if(isFallbackStep(document, stepId)) return 'Ответ по умолчанию удаляется только вместе с пустой папкой.';
  const references = incomingReferences(document, stepId);
  if(references.length) {
    const remaining = references.length > 5 ? `; ещё ${references.length - 5}` : '';
    return `На этот шаг ведут переходы: ${references.slice(0, 5).join('; ')}${remaining}. Сначала измените их переходы.`;
  }
  return null;
}

export function folderDeletionReason(document: ShellDocument, folderId: string): string | null {
  if(!Object.hasOwn(document.folders, folderId)) return 'Папка больше не существует.';
  if(document.folders[folderId].stepIds.length) return 'Сначала перенесите или удалите обычные экраны папки.';
  if(document.folderOrder.length === 1) return 'В боте должна остаться хотя бы одна папка.';
  const fallbackId = document.folders[folderId].fallbackStepId;
  const references = incomingReferences(document, fallbackId);
  if(references.length) return `На ответ папки ведут переходы: ${references.slice(0, 5).join('; ')}${references.length > 5 ? `; ещё ${references.length - 5}` : ''}. Сначала измените их переходы.`;
  return null;
}

/** A candidate enters the editor only here; failed changes preserve document and history. */
export function replaceDocument(state: EditorState, candidate: ShellDocument, expectedRevision: number): EditorState {
  try {
    requireRevision(state, expectedRevision);
    const document = validateDocument(candidate);
    if(document.id !== state.document.id) throw new Error('Идентификатор документа нельзя изменить.');
    for(const stepId of allStepIds(state.document)) {
      if(Object.hasOwn(document.steps, stepId) && document.steps[stepId].number !== state.document.steps[stepId].number) {
        throw new Error(`Номер существующего экрана ${stepReference(state.document, stepId)} нельзя изменить.`);
      }
    }
    for(const stepId of allStepIds(document)) {
      if(!Object.hasOwn(state.document.steps, stepId) && document.steps[stepId].number < state.document.nextStepNumber) {
        throw new Error('Новый экран не может использовать ранее выданный номер.');
      }
    }
    if(document.nextStepNumber < state.document.nextStepNumber) throw new Error('Счётчик номеров экранов нельзя уменьшить.');
    const base = finishTextEdit(state);
    if(base.error) return base;
    const creation = state.textEdit?.creation ? state.textEdit : null;
    if(creation && !state.document.content.messages[creation.messageId].trim() &&
      Object.hasOwn(document.content.messages, creation.messageId) && !document.content.messages[creation.messageId].trim()) {
      if(equal(document, state.document)) return base;
      throw new Error('Пустое новое сообщение уже завершено. Повторите изменение без него.');
    }
    if(equal(document, base.document)) return {...base, error: null};
    return {
      ...base, document, revision: nextRevision(base),
      selectedStepId: selection(document, base.selectedStepId),
      history: appendHistory(base.history, base.document),
      textEdit: null, error: null, changed: true
    };
  } catch(cause) {
    return error(state, cause);
  }
}

export function command(state: EditorState, operation: DocumentCommand, expectedRevision: number): EditorState {
  try {
    requireRevision(state, expectedRevision);
    const base = state.textEdit?.creation ? finishTextEdit(state) : state;
    if(base.error) return base;
    const document = validateDocument(base.document);
    let selectedStepId = base.selectedStepId;
    switch(operation.type) {
      case 'add_folder': {
        commandFields(operation, ['type', 'folderId', 'title', 'stepId', 'messageId', 'fallbackStepId', 'fallbackMessageId', 'rowId', 'buttonId']);
        validId(operation.folderId, 'folderId'); validId(operation.rowId, 'rowId'); validId(operation.buttonId, 'buttonId');
        if(Object.hasOwn(document.folders, operation.folderId)) throw new Error('Идентификатор папки уже используется.');
        if(Object.hasOwn(document.buttons, operation.buttonId)) throw new Error('Идентификатор кнопки уже используется.');
        addScreenData(document, operation.stepId, operation.messageId, {title: FolderDefaults.stepTitle, text: FolderDefaults.stepText});
        addScreenData(document, operation.fallbackStepId, operation.fallbackMessageId, {title: FolderDefaults.fallbackTitle, text: FolderDefaults.fallbackText});
        document.messages[operation.fallbackMessageId].rows = [{id: operation.rowId, buttonIds: [operation.buttonId]}];
        document.buttons[operation.buttonId] = {transition: {type: 'screen', screenId: operation.stepId}, color: 'default'};
        document.content.buttons[operation.buttonId] = FolderDefaults.fallbackButton;
        document.folderOrder.push(operation.folderId);
        document.folders[operation.folderId] = {stepIds: [operation.stepId], fallbackStepId: operation.fallbackStepId};
        document.content.folders[operation.folderId] = {title: operation.title};
        selectedStepId = operation.stepId;
        break;
      }
      case 'set_folder_title':
        commandFields(operation, ['type', 'folderId', 'title']);
        requireFolder(document, operation.folderId);
        document.content.folders[operation.folderId] = {title: operation.title};
        break;
      case 'delete_folder': {
        commandFields(operation, ['type', 'folderId']);
        const reason = folderDeletionReason(document, operation.folderId);
        if(reason) throw new Error(reason);
        const fallbackId = document.folders[operation.folderId].fallbackStepId;
        removeScreenData(document, fallbackId);
        delete document.folders[operation.folderId]; delete document.content.folders[operation.folderId];
        document.folderOrder.splice(document.folderOrder.indexOf(operation.folderId), 1);
        if(selectedStepId === fallbackId) selectedStepId = document.entryStepId;
        break;
      }
      case 'move_step_to_folder': {
        commandFields(operation, ['type', 'stepId', 'folderId']);
        requireStep(document, operation.stepId); requireFolder(document, operation.folderId);
        if(isFallbackStep(document, operation.stepId)) throw new Error('Ответ по умолчанию закреплён за папкой.');
        const sourceId = stepFolderId(document, operation.stepId);
        if(sourceId === operation.folderId) break;
        const source = document.folders[sourceId].stepIds;
        source.splice(source.indexOf(operation.stepId), 1);
        document.folders[operation.folderId].stepIds.push(operation.stepId);
        break;
      }
      case 'set_step_title':
        commandFields(operation, ['type', 'stepId', 'title']);
        requireStep(document, operation.stepId);
        document.content.steps[operation.stepId] = {title: operation.title};
        break;
      case 'set_message_text':
        commandFields(operation, ['type', 'stepId', 'messageId', 'text']);
        requireMessage(document, operation.stepId, operation.messageId);
        document.content.messages[operation.messageId] = operation.text;
        break;
      case 'add_message': {
        commandFields(operation, ['type', 'stepId', 'messageId', 'afterMessageId', 'text']);
        requireStep(document, operation.stepId);
        validId(operation.messageId, 'messageId');
        if(Object.hasOwn(document.content.messages, operation.messageId)) throw new Error('Идентификатор сообщения уже используется.');
        if(operation.afterMessageId !== null) requireMessage(document, operation.stepId, operation.afterMessageId);
        if(Object.hasOwn(document.blocks, operation.messageId)) throw new Error('Идентификатор блока уже используется.');
        const ids = document.steps[operation.stepId].blockIds;
        const index = operation.afterMessageId === null ? 0 : ids.indexOf(messageBlockId(document, operation.stepId, operation.afterMessageId)) + 1;
        ids.splice(index, 0, operation.messageId);
        document.blocks[operation.messageId] = {id: operation.messageId, type: 'message', messageId: operation.messageId};
        document.content.messages[operation.messageId] = operation.text;
        document.messages[operation.messageId] = {rows: []};
        break;
      }
      case 'delete_message': {
        commandFields(operation, ['type', 'stepId', 'messageId']);
        requireMessage(document, operation.stepId, operation.messageId);
        const ids = document.steps[operation.stepId].blockIds;
        if(ids.length === 1) throw new Error('На экране должен остаться хотя бы один блок.');
        const blockId = messageBlockId(document, operation.stepId, operation.messageId);
        ids.splice(ids.indexOf(blockId), 1); delete document.blocks[blockId];
        removeMessageData(document, operation.messageId);
        break;
      }
      case 'set_entry':
        commandFields(operation, ['type', 'stepId']);
        requireStep(document, operation.stepId);
        if(isFallbackStep(document, operation.stepId)) throw new Error('Ответ по умолчанию не может быть начальным экраном.');
        document.entryStepId = operation.stepId;
        break;
      case 'add_step': {
        commandFields(operation, ['type', 'stepId', 'messageId', 'afterStepId', 'content']);
        commandFields(operation.content, ['title', 'text']);
        requireStep(document, operation.afterStepId);
        const folder = document.folders[stepFolderId(document, operation.afterStepId)];
        const index = folder.fallbackStepId === operation.afterStepId ? folder.stepIds.length : folder.stepIds.indexOf(operation.afterStepId) + 1;
        addScreenData(document, operation.stepId, operation.messageId, operation.content);
        folder.stepIds.splice(index, 0, operation.stepId);
        selectedStepId = operation.stepId;
        break;
      }
      case 'delete_step': {
        commandFields(operation, ['type', 'stepId']);
        const reason = deletionReason(document, operation.stepId);
        if(reason) throw new Error(reason);
        const folder = document.folders[stepFolderId(document, operation.stepId)];
        const index = folder.stepIds.indexOf(operation.stepId);
        folder.stepIds.splice(index, 1);
        removeScreenData(document, operation.stepId);
        if(selectedStepId === operation.stepId) selectedStepId = folder.stepIds[Math.max(0, index - 1)] ?? folder.fallbackStepId;
        break;
      }
      case 'move_step': {
        commandFields(operation, ['type', 'stepId', 'index']);
        requireStep(document, operation.stepId);
        if(isFallbackStep(document, operation.stepId)) throw new Error('Ответ по умолчанию всегда остаётся последним в папке.');
        const steps = document.folders[stepFolderId(document, operation.stepId)].stepIds;
        if(!Number.isInteger(operation.index) || operation.index < 0 || operation.index >= steps.length) throw new Error('Позиция шага вне списка папки.');
        steps.splice(steps.indexOf(operation.stepId), 1);
        steps.splice(operation.index, 0, operation.stepId);
        break;
      }
      case 'set_button_transition':
        commandFields(operation, ['type', 'buttonId', 'transition']);
        if(!Object.hasOwn(document.buttons, operation.buttonId)) throw new Error('Кнопка больше не существует.');
        document.buttons[operation.buttonId].transition = operation.transition;
        break;
      case 'add_block': {
        commandFields(operation, ['type', 'stepId', 'afterBlockId', 'block', 'messageText']);
        requireStep(document, operation.stepId); validId(operation.block.id, 'blockId');
        if(Object.hasOwn(document.blocks, operation.block.id)) throw new Error('Идентификатор блока уже используется.');
        const ids = document.steps[operation.stepId].blockIds;
        if(operation.afterBlockId !== null && !ids.includes(operation.afterBlockId)) throw new Error('Начальный блок не принадлежит экрану.');
        if(operation.block.type === 'message' || operation.block.type === 'ask') {
          const messageId = operation.block.messageId; validId(messageId, 'messageId');
          if(Object.hasOwn(document.messages, messageId) || typeof operation.messageText !== 'string') throw new Error('Новый блок требует уникальное сообщение и текст.');
          document.messages[messageId] = {rows: []}; document.content.messages[messageId] = operation.messageText;
        } else if(operation.messageText !== null) throw new Error('Этот блок не содержит сообщения.');
        ids.splice(operation.afterBlockId === null ? 0 : ids.indexOf(operation.afterBlockId) + 1, 0, operation.block.id);
        document.blocks[operation.block.id] = operation.block;
        break;
      }
      case 'set_block': {
        commandFields(operation, ['type', 'stepId', 'block', 'messageText']); requireStep(document, operation.stepId);
        if(!document.steps[operation.stepId].blockIds.includes(operation.block.id)) throw new Error('Блок не принадлежит экрану.');
        const previous = document.blocks[operation.block.id];
        if(previous.type !== operation.block.type) throw new Error('Для другого типа добавьте новый блок.');
        if(operation.block.type === 'message' || operation.block.type === 'ask') {
          if(!('messageId' in previous) || previous.messageId !== operation.block.messageId) throw new Error('Идентичность сообщения блока нельзя изменить.');
          if(operation.messageText !== null) document.content.messages[operation.block.messageId] = operation.messageText;
        } else if(operation.messageText !== null) throw new Error('Этот блок не содержит сообщения.');
        document.blocks[operation.block.id] = operation.block;
        break;
      }
      case 'delete_block': {
        commandFields(operation, ['type', 'stepId', 'blockId']); requireStep(document, operation.stepId);
        const ids = document.steps[operation.stepId].blockIds;
        if(!ids.includes(operation.blockId)) throw new Error('Блок не принадлежит экрану.');
        if(ids.length === 1) throw new Error('На экране должен остаться хотя бы один блок.');
        const block = document.blocks[operation.blockId];
        if(block.type === 'message' || block.type === 'ask') removeMessageData(document, block.messageId);
        ids.splice(ids.indexOf(operation.blockId), 1); delete document.blocks[operation.blockId]; break;
      }
      case 'move_block': {
        commandFields(operation, ['type', 'stepId', 'blockId', 'index']); requireStep(document, operation.stepId);
        const ids = document.steps[operation.stepId].blockIds;
        if(!ids.includes(operation.blockId) || !Number.isInteger(operation.index) || operation.index < 0 || operation.index >= ids.length) throw new Error('Позиция блока вне экрана.');
        ids.splice(ids.indexOf(operation.blockId), 1); ids.splice(operation.index, 0, operation.blockId); break;
      }
      case 'set_variable':
        commandFields(operation, ['type', 'variable']); document.variables[operation.variable.id] = operation.variable; break;
      case 'delete_variable':
        commandFields(operation, ['type', 'variableId']);
        if(!Object.hasOwn(document.variables, operation.variableId)) throw new Error('Переменная отсутствует.');
        delete document.variables[operation.variableId]; break;
      case 'set_keyboard': {
        commandFields(operation, ['type', 'stepId', 'messageId', 'keyboard']);
        requireMessage(document, operation.stepId, operation.messageId);
        commandFields(operation.keyboard, ['rows', 'buttons', 'labels']);
        const previousIds = new Set(document.messages[operation.messageId].rows.flatMap((row) => row.buttonIds));
        const ids = Object.keys(operation.keyboard.buttons);
        if(ids.some((id) => Object.hasOwn(document.buttons, id) && !previousIds.has(id))) {
          throw new Error('Кнопка уже принадлежит другому сообщению.');
        }
        const labelIds = Object.keys(operation.keyboard.labels);
        if(labelIds.length !== ids.length || labelIds.some((id) => !ids.includes(id))) {
          throw new Error('Подписи должны точно соответствовать кнопкам этого шага.');
        }
        for(const id of previousIds) {
          delete document.buttons[id];
          delete document.content.buttons[id];
        }
        document.messages[operation.messageId].rows = operation.keyboard.rows;
        for(const id of ids) {
          validId(id, 'buttonId');
          document.buttons[id] = operation.keyboard.buttons[id];
          document.content.buttons[id] = operation.keyboard.labels[id];
        }
        break;
      }
      default:
        throw new Error('Неизвестная команда.');
    }
    const result = replaceDocument(base, document, base.revision);
    return result.error ? result : {...result, selectedStepId};
  } catch(cause) {
    return error(state, cause);
  }
}

/** A provisional insertion shares its entire history boundary with its first text session. */
export function beginNewMessage(state: EditorState, stepId: string, messageId: string, afterBlockId?: string | null): EditorState {
  try {
    if(state.textEdit?.creation && state.textEdit.stepId === stepId && state.textEdit.messageId === messageId) return {...state, error: null};
    const base = finishTextEdit(state);
    if(base.error) return base;
    requireStep(base.document, stepId);
    const added = command(base, {type: 'add_block', stepId, afterBlockId: afterBlockId === undefined ? base.document.steps[stepId].blockIds.at(-1)! : afterBlockId, block: {id: messageId, type: 'message', messageId}, messageText: ''}, base.revision);
    if(added.error) return error(state, new Error(added.error));
    return {...added, history: base.history, selectedStepId: stepId,
      textEdit: {stepId, messageId, before: validateDocument(base.document), creation: {changedBefore: base.changed}}};
  } catch(cause) {
    return error(state, cause);
  }
}

export function beginTextEdit(state: EditorState, stepId: string, messageId: string): EditorState {
  try {
    requireMessage(state.document, stepId, messageId);
    if(state.textEdit?.messageId === messageId) return {...state, error: null};
    const base = finishTextEdit(state);
    if(base.error) return base;
    return {...base, selectedStepId: stepId, textEdit: {stepId, messageId, before: validateDocument(base.document)}, error: null};
  } catch(cause) {
    return error(state, cause);
  }
}

export function inputText(state: EditorState, text: string): EditorState {
  try {
    if(!state.textEdit) throw new Error('Сначала выберите текст для редактирования.');
    if(typeof text !== 'string') throw new Error('Ожидается текст.');
    const messageId = state.textEdit.messageId;
    if(state.document.content.messages[messageId] === text) return {...state, error: null};
    const candidate = validateDocument(state.document);
    candidate.content.messages[messageId] = text;
    const document = validateDocument(candidate);
    return {...state, document, revision: nextRevision(state), changed: true, error: null};
  } catch(cause) {
    return error(state, cause);
  }
}

export function finishTextEdit(state: EditorState, cancel = false): EditorState {
  try {
    if(!state.textEdit) return {...state, error: null};
    const differs = !equal(state.document, state.textEdit.before);
    if(state.textEdit.creation && (cancel || !state.document.content.messages[state.textEdit.messageId].trim())) {
      return {...state, document: validateDocument(state.textEdit.before), revision: nextRevision(state),
        textEdit: null, error: null, changed: state.textEdit.creation.changedBefore};
    }
    if(cancel && differs) {
      return {
        ...state, document: validateDocument(state.textEdit.before), revision: nextRevision(state),
        textEdit: null, error: null, changed: true
      };
    }
    return {
      ...state, history: differs ? appendHistory(state.history, state.textEdit.before) : state.history,
      textEdit: null, error: null
    };
  } catch(cause) {
    return error(state, cause);
  }
}

export function undo(state: EditorState): EditorState {
  try {
    const base = finishTextEdit(state);
    if(base.error || !base.history.length) return base;
    const candidate = structuredClone(base.history[base.history.length - 1]);
    candidate.nextStepNumber = Math.max(candidate.nextStepNumber, base.document.nextStepNumber);
    const document = validateDocument(candidate);
    return {
      ...base, document, revision: nextRevision(base), history: base.history.slice(0, -1),
      selectedStepId: selection(document, base.selectedStepId), textEdit: null, changed: true, error: null
    };
  } catch(cause) {
    return error(state, cause);
  }
}

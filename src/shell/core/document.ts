import {ButtonColors, ShellLimits, type ButtonColor} from './types';
import type {ShellDocument} from './types';
import {validateLegacyDocument} from './legacy-v5';
import {VariableCatalog, validateVariable} from './values';
import {validateBlock, validateTransition} from './blocks';
import {fail, object, fields, validId, string, array, matchingKeys} from './validation';
export {validId} from './validation';
const encoder = new TextEncoder();

/** Strict data boundary. Returns detached canonical data, never the input reference. */
export function validateDocument(value: unknown): ShellDocument {
  let textBytes = 0;
  function readText(value: unknown, path: string): string {
    const result = string(value, path);
    textBytes += encoder.encode(result).byteLength;
    if(textBytes > ShellLimits.documentBytes) fail('document', 'размер документа превышает 1 MiB');
    return result;
  }
  let raw = object(value, 'document');
  if(raw.schemaVersion === 5) {
    const old = validateLegacyDocument(value);
    raw = {...old, schemaVersion: 6, variables: structuredClone(VariableCatalog),
      steps: Object.fromEntries(Object.entries(old.steps).map(([id, step]) => [id, {number: step.number, blockIds: [...step.messageIds]}])),
      blocks: Object.fromEntries(Object.values(old.steps).flatMap(step => step.messageIds.map(id => [id, {id, type: 'message', messageId: id}]))),
      buttons: Object.fromEntries(Object.entries(old.buttons).map(([id, button]) => [id, {color: button.color, transition: button.targetStepId === null ? null : {type: 'screen', screenId: button.targetStepId}}]))};
  }
  if(raw.schemaVersion !== 6) fail('document.schemaVersion', 'поддерживаются версии 5 и 6');
  const source = fields(raw, ['schemaVersion', 'id', 'bot', 'entryStepId', 'nextStepNumber', 'folderOrder', 'folders', 'steps', 'buttons', 'content', 'messages', 'blocks', 'variables'], 'document');
  validId(source.id, 'document.id');
  validId(source.entryStepId, 'document.entryStepId');
  const bot = fields(source.bot, ['username', 'title', 'status'], 'document.bot');
  const username = readText(bot.username, 'document.bot.username');
  if(!/^@?[A-Za-z][A-Za-z0-9_]{0,63}$/.test(username)) fail('document.bot.username', 'некорректное имя бота');
  if(bot.status !== 'bot') fail('document.bot.status', 'ожидается bot');
  const folderOrder = array(source.folderOrder, 'document.folderOrder', ShellLimits.steps).map(id => {
    validId(id, 'document.folderOrder'); return id;
  });
  if(!folderOrder.length || new Set(folderOrder).size !== folderOrder.length) fail('document.folderOrder', 'нужна хотя бы одна папка без повторов');
  const folders = object(source.folders, 'document.folders');
  matchingKeys(folders, folderOrder, 'document.folders');
  const content = fields(source.content, ['folders', 'steps', 'messages', 'buttons'], 'document.content');
  const folderContent = object(content.folders, 'document.content.folders');
  matchingKeys(folderContent, folderOrder, 'document.content.folders');
  const validatedFolders: ShellDocument['folders'] = {};
  const validatedFolderContent: ShellDocument['content']['folders'] = {};
  const stepOrder: string[] = [];
  const fallbackIds = new Set<string>();
  for(const id of folderOrder) {
    const folder = fields(folders[id], ['stepIds', 'fallbackStepId'], `document.folders.${id}`);
    const stepIds = array(folder.stepIds, `document.folders.${id}.stepIds`, ShellLimits.steps).map(stepId => {
      validId(stepId, `document.folders.${id}.stepIds`); return stepId;
    });
    validId(folder.fallbackStepId, `document.folders.${id}.fallbackStepId`);
    stepOrder.push(...stepIds, folder.fallbackStepId);
    fallbackIds.add(folder.fallbackStepId);
    validatedFolders[id] = {stepIds, fallbackStepId: folder.fallbackStepId};
    const title = fields(folderContent[id], ['title'], `document.content.folders.${id}`);
    validatedFolderContent[id] = {title: readText(title.title, `document.content.folders.${id}.title`)};
  }
  if(stepOrder.length > ShellLimits.steps) fail('document.steps', `максимум ${ShellLimits.steps} экранов вместе с ответами по умолчанию`);
  if(new Set(stepOrder).size !== stepOrder.length) fail('document.folders', 'каждый экран должен принадлежать ровно одной папке без повторов');
  if(!stepOrder.includes(source.entryStepId)) fail('document.entryStepId', 'начальный шаг отсутствует');
  if(fallbackIds.has(source.entryStepId)) fail('document.entryStepId', 'ответ по умолчанию не может быть начальным экраном');
  const steps = object(source.steps, 'document.steps');
  matchingKeys(steps, stepOrder, 'document.steps');
  const stepContent = object(content.steps, 'document.content.steps');
  matchingKeys(stepContent, stepOrder, 'document.content.steps');
  const buttons = object(source.buttons, 'document.buttons');
  const buttonIds = Object.keys(buttons);
  if(buttonIds.length > ShellLimits.buttons) fail('document.buttons', `максимум ${ShellLimits.buttons} кнопок`);
  buttonIds.forEach(id => validId(id, 'document.buttons.id'));
  const labels = object(content.buttons, 'document.content.buttons');
  matchingKeys(labels, buttonIds, 'document.content.buttons');
  const messages = object(content.messages, 'document.content.messages');
  const messageIds = Object.keys(messages);
  if(messageIds.length > ShellLimits.documentMessages) fail('document.content.messages', `максимум ${ShellLimits.documentMessages} сообщений`);
  messageIds.forEach(id => validId(id, 'document.content.messages.id'));
  const messageStructures = object(source.messages, 'document.messages');
  matchingKeys(messageStructures, messageIds, 'document.messages');
  const nextStepNumber = source.nextStepNumber;
  if(!Number.isSafeInteger(nextStepNumber) || (nextStepNumber as number) < 1 || (nextStepNumber as number) > ShellLimits.stepNumber + 1) {
    fail('document.nextStepNumber', `ожидается целое число от 1 до ${ShellLimits.stepNumber + 1}`);
  }
  const rawVariables = object(source.variables, 'document.variables');
  if(Object.keys(rawVariables).length > 100) fail('document.variables', 'максимум 100 переменных');
  const variables = Object.fromEntries(Object.keys(rawVariables).sort().map(id => [id, validateVariable(rawVariables[id], id)]));
  const rawBlocks = object(source.blocks, 'document.blocks');
  const blockIds = Object.keys(rawBlocks);
  if(blockIds.length > ShellLimits.blocks) fail('document.blocks', `максимум ${ShellLimits.blocks} блоков`);
  blockIds.forEach(id => validId(id, 'blockId'));
  const result: ShellDocument = {
    schemaVersion: 6, id: source.id,
    bot: {username, title: readText(bot.title, 'document.bot.title'), status: 'bot'},
    entryStepId: source.entryStepId, nextStepNumber: nextStepNumber as number,
    folderOrder, folders: validatedFolders, steps: {}, blocks: {}, variables, messages: {}, buttons: {},
    content: {folders: validatedFolderContent, steps: {}, messages: {}, buttons: {}}
  };
  const usedMessages = new Set<string>();
  const usedStepNumbers = new Set<number>();
  const usedRows = new Set<string>();
  const usedButtons = new Set<string>();
  function readRows(value: unknown, path: string): ShellDocument['messages'][string]['rows'] {
    return array(value, path, ShellLimits.rows).map((value, rowIndex) => {
      const rowPath = `${path}[${rowIndex}]`;
      const row = fields(value, ['id', 'buttonIds'], rowPath);
      validId(row.id, `${rowPath}.id`);
      if(usedRows.has(row.id)) fail(`${rowPath}.id`, 'идентификатор ряда уже используется');
      usedRows.add(row.id);
      const rowButtons = array(row.buttonIds, `${rowPath}.buttonIds`, ShellLimits.buttonsPerRow).map((id) => {
        validId(id, `${rowPath}.buttonIds`);
        if(!Object.hasOwn(buttons, id)) fail(rowPath, `кнопка ${id} отсутствует`);
        if(usedButtons.has(id)) fail(rowPath, `кнопка ${id} используется больше одного раза`);
        usedButtons.add(id);
        const button = fields(buttons[id], ['transition', 'color'], `document.buttons.${id}`);
        const color = button.color;
        if(typeof color !== 'string' || !ButtonColors.includes(color as ButtonColor)) fail(`document.buttons.${id}.color`, 'нужен допустимый цвет кнопки');
        result.buttons[id] = {transition: validateTransition(button.transition, result, true), color: color as ButtonColor};
        result.content.buttons[id] = readText(labels[id], `document.content.buttons.${id}`);
        return id;
      });
      if(!rowButtons.length) fail(rowPath, 'пустой ряд нужно удалить');
      return {id: row.id, buttonIds: rowButtons};
    });
  }
  const usedBlocks = new Set<string>();
  for(const stepId of stepOrder) {
    const step = fields(steps[stepId], ['number', 'blockIds'], `document.steps.${stepId}`);
    const stepNumber = step.number;
    if(!Number.isSafeInteger(stepNumber) || (stepNumber as number) < 1 || (stepNumber as number) > ShellLimits.stepNumber) fail(`document.steps.${stepId}.number`, `ожидается целое число от 1 до ${ShellLimits.stepNumber}`);
    if(usedStepNumbers.has(stepNumber as number)) fail(`document.steps.${stepId}.number`, 'номер экрана уже используется');
    usedStepNumbers.add(stepNumber as number);
    const ids = array(step.blockIds, `document.steps.${stepId}.blockIds`, ShellLimits.blocksPerStep).map(id => {
      validId(id, 'blockId');
      if(!Object.hasOwn(rawBlocks, id)) fail('blockId', 'блок отсутствует');
      if(usedBlocks.has(id)) fail('blockId', 'блок используется больше одного раза');
      usedBlocks.add(id); return id;
    });
    if(!ids.length) fail(`document.steps.${stepId}.blockIds`, 'нужен хотя бы один блок');
    result.steps[stepId] = {number: stepNumber as number, blockIds: ids};
    const text = fields(stepContent[stepId], ['title'], `document.content.steps.${stepId}`);
    result.content.steps[stepId] = {title: readText(text.title, `document.content.steps.${stepId}.title`)};
  }
  for(const stepId of stepOrder) {
    let textCount = 0;
    for(const blockId of result.steps[stepId].blockIds) {
      const block = validateBlock(rawBlocks[blockId], blockId, {...result, messages: messageStructures as ShellDocument['messages']});
      result.blocks[blockId] = block;
      if(block.type !== 'message' && block.type !== 'ask') continue;
      if(++textCount > ShellLimits.messagesPerStep) fail(`steps.${stepId}`, `максимум ${ShellLimits.messagesPerStep} сообщений`);
      const id = block.messageId;
      if(usedMessages.has(id)) fail(`blocks.${blockId}.messageId`, 'сообщение используется больше одного раза');
      usedMessages.add(id);
      result.content.messages[id] = readText(messages[id], `document.content.messages.${id}`);
      const structure = fields(messageStructures[id], ['rows'], `document.messages.${id}`);
      result.messages[id] = {rows: readRows(structure.rows, `document.messages.${id}.rows`)};
    }
  }
  if(usedBlocks.size !== blockIds.length) fail('document.blocks', 'каждый блок должен принадлежать одному экрану');
  if(result.nextStepNumber <= Math.max(...usedStepNumbers)) fail('document.nextStepNumber', 'должен быть больше всех выданных номеров экранов');
  if(usedMessages.size !== messageIds.length) fail('document.content.messages', 'каждое сообщение должно принадлежать одному экрану');
  if(usedButtons.size !== buttonIds.length) fail('document.buttons', 'каждая кнопка должна принадлежать одному ряду');
  if(documentBytes(result) > ShellLimits.documentBytes) fail('document', 'размер документа превышает 1 MiB');
  return result;
}

/** The validator creates keys in visual order, making output independent of map insertion order. */
export function serializeDocument(document: ShellDocument): string {
  return JSON.stringify(validateDocument(document), null, 2) + '\n';
}

export function documentBytes(document: ShellDocument): number {
  return encoder.encode(JSON.stringify(document, null, 2) + '\n').byteLength;
}

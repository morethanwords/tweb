import {ButtonColors, ShellLimits, type ButtonColor} from './types';
import type {ShellDocument as CurrentDocument} from './types';
export type LegacyDocument = Omit<CurrentDocument, 'schemaVersion' | 'steps' | 'blocks' | 'variables' | 'buttons'> & {schemaVersion: 5; steps: Record<string, {number: number; messageIds: string[]}>; buttons: Record<string, {targetStepId: string | null; color: ButtonColor}>};
type ShellDocument = LegacyDocument;
import {fail, object, fields, validId, string, array, matchingKeys} from './validation';
export {validId} from './validation';
const encoder = new TextEncoder();

/** Strict data boundary. Returns detached canonical data, never the input reference. */
export function validateLegacyDocument(value: unknown): ShellDocument {
  let textBytes = 0;
  function readText(value: unknown, path: string): string {
    const result = string(value, path);
    textBytes += encoder.encode(result).byteLength;
    if(textBytes > ShellLimits.documentBytes) fail('document', 'размер документа превышает 1 MiB');
    return result;
  }
  const raw = object(value, 'document');
  if(raw.schemaVersion !== 5) fail('document.schemaVersion', 'поддерживается только версия 5');
  const source = fields(raw, ['schemaVersion', 'id', 'bot', 'entryStepId', 'nextStepNumber', 'folderOrder', 'folders', 'steps', 'buttons', 'content', 'messages'], 'document');
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
  const result: ShellDocument = {
    schemaVersion: 5, id: source.id,
    bot: {username, title: readText(bot.title, 'document.bot.title'), status: 'bot'},
    entryStepId: source.entryStepId, nextStepNumber: nextStepNumber as number,
    folderOrder, folders: validatedFolders, steps: {}, messages: {}, buttons: {},
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
        const button = fields(buttons[id], ['targetStepId', 'color'], `document.buttons.${id}`);
        if(button.targetStepId !== null) {
          validId(button.targetStepId, `document.buttons.${id}.targetStepId`);
          if(!stepOrder.includes(button.targetStepId)) fail(`document.buttons.${id}.targetStepId`, 'целевой шаг отсутствует');
        }
        const color = button.color;
        if(typeof color !== 'string' || !ButtonColors.includes(color as ButtonColor)) fail(`document.buttons.${id}.color`, 'нужен допустимый цвет кнопки');
        result.buttons[id] = {targetStepId: button.targetStepId, color: color as ButtonColor};
        result.content.buttons[id] = readText(labels[id], `document.content.buttons.${id}`);
        return id;
      });
      if(!rowButtons.length) fail(rowPath, 'пустой ряд нужно удалить');
      return {id: row.id, buttonIds: rowButtons};
    });
  }
  for(const stepId of stepOrder) {
    const step = fields(steps[stepId], ['number', 'messageIds'], `document.steps.${stepId}`);
    const stepNumber = step.number;
    if(!Number.isSafeInteger(stepNumber) || (stepNumber as number) < 1 || (stepNumber as number) > ShellLimits.stepNumber) fail(`document.steps.${stepId}.number`, `ожидается целое число от 1 до ${ShellLimits.stepNumber}`);
    if(usedStepNumbers.has(stepNumber as number)) fail(`document.steps.${stepId}.number`, 'номер экрана уже используется');
    usedStepNumbers.add(stepNumber as number);
    const ids = array(step.messageIds, `document.steps.${stepId}.messageIds`, ShellLimits.messagesPerStep).map(id => {
      validId(id, `document.steps.${stepId}.messageIds`);
      if(!Object.hasOwn(messages, id)) fail(`document.steps.${stepId}.messageIds`, `сообщение ${id} отсутствует`);
      return id;
    });
    if(!ids.length) fail(`document.steps.${stepId}.messageIds`, 'нужно хотя бы одно сообщение');
    for(const id of ids) {
      if(usedMessages.has(id)) fail(`document.steps.${stepId}.messageIds`, `сообщение ${id} используется больше одного раза`);
      usedMessages.add(id);
      result.content.messages[id] = readText(messages[id], `document.content.messages.${id}`);
      const structure = fields(messageStructures[id], ['rows'], `document.messages.${id}`);
      const rows = structure.rows;
      result.messages[id] = {rows: readRows(rows, `document.messages.${id}.rows`)};
    }
    result.steps[stepId] = {number: stepNumber as number, messageIds: ids};
    const text = fields(stepContent[stepId], ['title'], `document.content.steps.${stepId}`);
    result.content.steps[stepId] = {title: readText(text.title, `document.content.steps.${stepId}.title`)};
  }
  if(result.nextStepNumber <= Math.max(...usedStepNumbers)) fail('document.nextStepNumber', 'должен быть больше всех выданных номеров экранов');
  if(usedMessages.size !== messageIds.length) fail('document.content.messages', 'каждое сообщение должно принадлежать одному экрану');
  if(usedButtons.size !== buttonIds.length) fail('document.buttons', 'каждая кнопка должна принадлежать одному ряду');
  if(documentBytes(result) > ShellLimits.documentBytes) fail('document', 'размер документа превышает 1 MiB');
  return result;
}

/** The validator creates keys in visual order, making output independent of map insertion order. */
export function serializeDocument(document: ShellDocument): string {
  return JSON.stringify(validateLegacyDocument(document), null, 2) + '\n';
}

export function documentBytes(document: ShellDocument): number {
  return encoder.encode(JSON.stringify(document, null, 2) + '\n').byteLength;
}

import type {Block, ShellDocument, StepSummary, Transition} from './types';
import {blockTransitionEntries} from './blocks';

/** Folder membership is the single source of screen ownership and display order. */
export function folderStepIds(document: ShellDocument, folderId: string): string[] {
  if(!Object.hasOwn(document.folders, folderId)) throw new Error('Папка больше не существует.');
  const folder = document.folders[folderId];
  return [...folder.stepIds, folder.fallbackStepId];
}

export function allStepIds(document: ShellDocument): string[] {
  return document.folderOrder.flatMap(id => folderStepIds(document, id));
}

export function stepFolderId(document: ShellDocument, stepId: string): string {
  if(!Object.hasOwn(document.steps, stepId)) throw new Error('Шаг больше не существует.');
  const folderId = document.folderOrder.find(id => document.folders[id].fallbackStepId === stepId || document.folders[id].stepIds.includes(stepId));
  if(!folderId) throw new Error('Экран не принадлежит папке.');
  return folderId;
}

export function isFallbackStep(document: ShellDocument, stepId: string): boolean {
  return document.folders[stepFolderId(document, stepId)].fallbackStepId === stepId;
}

export function formatStepNumber(number: number): string {
  return String(number).padStart(2, '0');
}

/** Stable human reference: number is identity, title is meaning. */
export function stepReference(document: ShellDocument, stepId: string): string {
  if(!Object.hasOwn(document.steps, stepId)) throw new Error('Шаг больше не существует.');
  return `${formatStepNumber(document.steps[stepId].number)} · ${document.content.steps[stepId].title || 'Без названия'}`;
}

export function stepMessageIds(document: ShellDocument, stepId: string): readonly string[] {
  if(!Object.hasOwn(document.steps, stepId)) throw new Error('Шаг больше не существует.');
  return document.steps[stepId].blockIds.flatMap(id => {const block = document.blocks[id]; return block.type === 'message' || block.type === 'ask' ? [block.messageId] : [];});
}

export function stepButtonIds(document: ShellDocument, stepId: string): string[] {
  return stepMessageIds(document, stepId).flatMap(id => document.messages[id].rows.flatMap(row => row.buttonIds));
}

export function stepText(document: ShellDocument, stepId: string): string {
  return stepMessageIds(document, stepId).map(id => document.content.messages[id]).join('\n\n');
}

/** Every authored message in a batch must be ready; empty drafts are never silently skipped. */
export function stepReadiness(document: ShellDocument, stepId: string): string | null {
  const index = stepMessageIds(document, stepId).findIndex(id => !document.content.messages[id].trim());
  return index === -1 ? null : `Сообщение ${index + 1} на экране пустое. Добавьте текст.`;
}

/** An ending belongs to graph structure, never its position in the author sidebar. */
export function isTerminalStep(document: ShellDocument, stepId: string): boolean {
  return document.steps[stepId].blockIds.every(id => document.blocks[id].type === 'message') && stepButtonIds(document, stepId).length === 0 && stepReadiness(document, stepId) === null;
}

export function stepSummary(document: ShellDocument, stepId: string): StepSummary {
  if(!Object.hasOwn(document.steps, stepId)) throw new Error('Шаг больше не существует.');
  const text = stepText(document, stepId);
  const collapsed = text.replace(/\s+/g, ' ').trim();
  let preview = '';
  let characters = 0;
  for(const character of collapsed) {
    if(characters === 100) {preview = Array.from(preview).slice(0, 99).join('') + '…'; break;}
    preview += character;
    characters++;
  }
  return {
    preview: preview || (stepMessageIds(document, stepId).length ? 'Добавьте сообщение' : blockLabel(document.blocks[document.steps[stepId].blockIds[0]])),
    isEntry: document.entryStepId === stepId,
    isTerminal: isTerminalStep(document, stepId),
    isEmpty: !collapsed && stepMessageIds(document, stepId).length > 0,
    unassigned: stepButtonIds(document, stepId)
      .filter(id => document.buttons[id].transition === null).length
  };
}

export function messageBlockId(document: ShellDocument, stepId: string, messageId: string): string {
  const id = document.steps[stepId]?.blockIds.find(id => {const block = document.blocks[id]; return (block.type === 'message' || block.type === 'ask') && block.messageId === messageId;});
  if(!id) throw new Error('Сообщение не принадлежит этому экрану.');
  return id;
}

function blockLabel(block: Block): string {
  return {message: 'Сообщение', ask: 'Вопрос', decision: 'Условие', action: 'Действие', wait: 'Ожидание', code: 'Код'}[block.type];
}

export function documentTransitions(document: ShellDocument): {stepId: string; blockId: string; buttonId?: string; label: string; transition: Transition}[] {
  return allStepIds(document).flatMap(stepId => document.steps[stepId].blockIds.flatMap(blockId => {
    const block = document.blocks[blockId];
    const result: ReturnType<typeof documentTransitions> = blockTransitionEntries(block).map(item => ({stepId, blockId, ...item}));
    if(block.type === 'message' || block.type === 'ask') {
      for(const buttonId of document.messages[block.messageId].rows.flatMap(row => row.buttonIds)) {
        const transition = document.buttons[buttonId].transition;
        if(transition) result.push({stepId, blockId, buttonId, label: `«${document.content.buttons[buttonId].trim() || 'Без подписи'}»`, transition});
      }
    }
    return result;
  }));
}

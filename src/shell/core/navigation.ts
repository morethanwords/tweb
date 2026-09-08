import type {ShellDocument, StepSummary} from './types';

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
  return document.steps[stepId].messageIds;
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
  return stepButtonIds(document, stepId).length === 0 && stepReadiness(document, stepId) === null;
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
    preview: preview || 'Добавьте сообщение',
    isEntry: document.entryStepId === stepId,
    isTerminal: isTerminalStep(document, stepId),
    isEmpty: !collapsed,
    unassigned: stepButtonIds(document, stepId)
      .filter(id => document.buttons[id].targetStepId === null).length
  };
}

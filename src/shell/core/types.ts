export const ShellLimits = Object.freeze({
  steps: 100, buttons: 500, rows: 8, buttonsPerRow: 8, messagesPerStep: 10, documentMessages: 500,
  stepNumber: 9999,
  documentBytes: 1024 * 1024, undoEntries: 20, undoBytes: 8 * 1024 * 1024,
  messages: 201, textCharacters: 4096, typingMs: 350, aiTimeoutMs: 30_000
});
export const ButtonColors = ['default', 'blue', 'green', 'red'] as const;
export type ButtonColor = typeof ButtonColors[number];
export interface ButtonDefinition {targetStepId: string | null; color: ButtonColor}
export type KeyboardRow = {id: string; buttonIds: string[]};
export type StepContent = {title: string};
export interface ShellDocument {
  schemaVersion: 5;
  id: string;
  bot: {username: string; title: string; status: 'bot'};
  entryStepId: string;
  nextStepNumber: number;
  folderOrder: string[];
  folders: Record<string, {stepIds: string[]; fallbackStepId: string}>;
  steps: Record<string, {number: number; messageIds: string[]}>;
  messages: Record<string, {rows: KeyboardRow[]}>;
  buttons: Record<string, ButtonDefinition>;
  content: {folders: Record<string, {title: string}>; steps: Record<string, StepContent>; messages: Record<string, string>; buttons: Record<string, string>};
}
export interface KeyboardDraft {
  rows: KeyboardRow[];
  buttons: Record<string, ButtonDefinition>;
  labels: Record<string, string>;
}
export type DocumentCommand =
  | {type: 'add_folder'; folderId: string; title: string; stepId: string; messageId: string; fallbackStepId: string; fallbackMessageId: string; rowId: string; buttonId: string}
  | {type: 'set_folder_title'; folderId: string; title: string}
  | {type: 'delete_folder'; folderId: string}
  | {type: 'move_step_to_folder'; stepId: string; folderId: string}
  | {type: 'set_step_title'; stepId: string; title: string}
  | {type: 'set_message_text'; stepId: string; messageId: string; text: string}
  | {type: 'add_message'; stepId: string; messageId: string; afterMessageId: string | null; text: string}
  | {type: 'delete_message'; stepId: string; messageId: string}
  | {type: 'set_entry'; stepId: string}
  | {type: 'add_step'; stepId: string; messageId: string; afterStepId: string; content: {title: string; text: string}}
  | {type: 'delete_step'; stepId: string}
  | {type: 'move_step'; stepId: string; index: number}
  | {type: 'set_button_target'; buttonId: string; targetStepId: string}
  | {type: 'set_keyboard'; stepId: string; messageId: string; keyboard: KeyboardDraft};
export interface EditorState {
  document: ShellDocument; revision: number; selectedStepId: string;
  history: ShellDocument[];
  textEdit: {stepId: string; messageId: string; before: ShellDocument; creation?: {changedBefore: boolean}} | null;
  error: string | null; changed: boolean;
}
export type RunMessage =
  | {id: string; kind: 'bot'; stepId: string; messageId: string; at: number}
  | {id: string; kind: 'user'; stepId: string; buttonId: string; text: string; at: number}
  | {id: string; kind: 'text'; stepId: string; text: string; clientMessageId: string; at: number};
export type PendingReply = {id: string; kind: 'step'; targetStepId: string; dueAt: number};
export interface TestRun {
  id: string; document: ShellDocument; messages: RunMessage[];
  phase: 'ready' | 'waiting' | 'ended' | 'limited';
  activeMessageId: string;
  pending: PendingReply | null;
  error: string | null;
}
export interface StepSummary {
  preview: string; isEntry: boolean; isTerminal: boolean; isEmpty: boolean; unassigned: number;
}
export interface AiRequest {
  requestId: string; documentId: string; baseRevision: number;
  prompt: string; document: ShellDocument; signal: AbortSignal;
}
export interface AiAdapter {apply(request: AiRequest): Promise<{candidate: ShellDocument}>}

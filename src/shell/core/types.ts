export const ShellLimits = Object.freeze({
  steps: 100, buttons: 500, rows: 8, buttonsPerRow: 8, messagesPerStep: 10, documentMessages: 500,
  blocksPerStep: 30, blocks: 500, cases: 20, outcomes: 20, httpAttempts: 20, codeBytes: 32 * 1024, codeValueBytes: 64 * 1024, autoTransitions: 100, traceEntries: 1000, eventIds: 1000,
  stepNumber: 9999,
  documentBytes: 1024 * 1024, undoEntries: 20, undoBytes: 8 * 1024 * 1024,
  messages: 201, textCharacters: 4096, typingMs: 350, aiTimeoutMs: 30_000
});
export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
export type VariableScope = 'user' | 'conversation' | 'run' | 'bot' | 'event' | 'system';
export type ValueType = 'number' | 'string' | 'boolean' | 'json';
export interface VariableDefinition {id: string; label: string; scope: VariableScope; valueType: ValueType}
export type ValueSource = {type: 'literal'; value: JsonValue} | {type: 'variable'; variableId: string};
export type Transition = {type: 'continue'} | {type: 'screen'; screenId: string} | {type: 'end'};
export type Condition = {variableId: string; operator: 'exists'} |
  {variableId: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'; value: ValueSource};
export const ButtonColors = ['default', 'blue', 'green', 'red'] as const;
export type ButtonColor = typeof ButtonColors[number];
export interface ButtonDefinition {transition: Transition | null; color: ButtonColor}
export type KeyboardRow = {id: string; buttonIds: string[]};
export type StepContent = {title: string};
export interface MessageBlock {id: string; type: 'message'; messageId: string}
export interface AskBlock {id: string; type: 'ask'; messageId: string; variableId: string; answerType: 'text' | 'number' | 'choice'; choices: {id: string; label: string; value: JsonValue}[]; success: Transition; error: Transition | null}
export interface DecisionBlock {id: string; type: 'decision'; cases: {id: string; label: string; condition: Condition; transition: Transition}[]; otherwise: Transition}
export type LocalAction =
  | {type: 'set'; variableId: string; value: ValueSource}
  | {type: 'increment'; variableId: string; amount: number}
  | {type: 'table_create'; table: 'orders'; values: Record<string, ValueSource>; resultVariableId: string | null}
  | {type: 'table_find'; table: 'orders'; where: Record<string, ValueSource>; resultVariableId: string}
  | {type: 'table_update'; table: 'orders'; where: Record<string, ValueSource>; values: Record<string, ValueSource>; resultVariableId: string | null}
  | {type: 'http_mock'; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; headers: Record<string, string>; body: JsonValue; attempts: number; fixture: {status: number; body: JsonValue; failuresBeforeSuccess: number}; resultVariableId: string | null};
export interface ActionBlock {id: string; type: 'action'; action: LocalAction; success: Transition; error: Transition | null}
export type WaitDefinition =
  | {type: 'duration'; milliseconds: number; unit: 'seconds' | 'minutes' | 'hours' | 'days'}
  | {type: 'date'; at: number}
  | {type: 'event'; name: string}
  | {type: 'input'; mode: 'any' | 'text' | 'command'; variableId: string | null};
export interface WaitBlock {id: string; type: 'wait'; wait: WaitDefinition; success: Transition; timeout: {milliseconds: number; transition: Transition} | null}
export interface CodeBlock {id: string; type: 'code'; name: string; source: string; outcomes: {id: string; name: string; transition: Transition}[]; resultVariableId: string | null}
export type Block = MessageBlock | AskBlock | DecisionBlock | ActionBlock | WaitBlock | CodeBlock;
export interface ShellDocument {
  schemaVersion: 6;
  id: string;
  bot: {username: string; title: string; status: 'bot'};
  entryStepId: string;
  nextStepNumber: number;
  folderOrder: string[];
  folders: Record<string, {stepIds: string[]; fallbackStepId: string}>;
  steps: Record<string, {number: number; blockIds: string[]}>;
  blocks: Record<string, Block>;
  variables: Record<string, VariableDefinition>;
  messages: Record<string, {rows: KeyboardRow[]}>;
  buttons: Record<string, ButtonDefinition>;
  content: {folders: Record<string, {title: string}>; steps: Record<string, StepContent>; messages: Record<string, string>; buttons: Record<string, string>};
}
export interface KeyboardDraft {rows: KeyboardRow[]; buttons: Record<string, ButtonDefinition>; labels: Record<string, string>}
export type DocumentCommand =
  | {type: 'add_folder'; folderId: string; title: string; stepId: string; messageId: string; fallbackStepId: string; fallbackMessageId: string; rowId: string; buttonId: string}
  | {type: 'set_folder_title'; folderId: string; title: string}
  | {type: 'delete_folder'; folderId: string}
  | {type: 'move_step_to_folder'; stepId: string; folderId: string}
  | {type: 'set_step_title'; stepId: string; title: string}
  | {type: 'set_message_text'; stepId: string; messageId: string; text: string}
  | {type: 'add_message'; stepId: string; messageId: string; afterMessageId: string | null; text: string}
  | {type: 'delete_message'; stepId: string; messageId: string}
  | {type: 'add_block'; stepId: string; afterBlockId: string | null; block: Block; messageText: string | null}
  | {type: 'set_block'; stepId: string; block: Block; messageText: string | null}
  | {type: 'delete_block'; stepId: string; blockId: string}
  | {type: 'move_block'; stepId: string; blockId: string; index: number}
  | {type: 'set_variable'; variable: VariableDefinition}
  | {type: 'delete_variable'; variableId: string}
  | {type: 'set_entry'; stepId: string}
  | {type: 'add_step'; stepId: string; messageId: string; afterStepId: string; content: {title: string; text: string}}
  | {type: 'delete_step'; stepId: string}
  | {type: 'move_step'; stepId: string; index: number}
  | {type: 'set_button_transition'; buttonId: string; transition: Transition | null}
  | {type: 'set_keyboard'; stepId: string; messageId: string; keyboard: KeyboardDraft};
export interface EditorState {
  document: ShellDocument; revision: number; selectedStepId: string; history: ShellDocument[];
  textEdit: {stepId: string; messageId: string; before: ShellDocument; creation?: {changedBefore: boolean}} | null;
  error: string | null; changed: boolean;
}
export type RunMessage =
  | {id: string; kind: 'bot'; stepId: string; messageId: string; activationId: string; frameId: string; values: Record<string, JsonValue>; at: number}
  | {id: string; kind: 'user'; stepId: string; buttonId: string; text: string; at: number}
  | {id: string; kind: 'text'; stepId: string; text: string; clientMessageId: string; at: number};
export interface RunCursor {stepId: string; blockIndex: number; activationId: string; frameId: string; visitId: string}
export type CodeContext = Record<VariableScope, Record<string, JsonValue>>;
export interface CodeRequest {source: string; context: CodeContext; outcomes: string[]; variableTypes: Record<string, ValueType>}
export type PendingReply =
  | {id: string; kind: 'step'; targetStepId: string; blockIndex: number; reservedMessages: number; dueAt: number; visitId?: string}
  | {id: string; kind: 'ask'; activationId: string}
  | {id: string; kind: 'wait'; activationId: string; dueAt: number | null; timeoutAt: number | null}
  | {id: string; kind: 'code'; activationId: string; blockId: string; request: CodeRequest};
export interface RunTrace {id: string; activationId: string; blockId: string; stepId: string; at: number; status: 'entered' | 'succeeded' | 'waiting' | 'failed'; detail: string; attempt: number}
export interface TestSeed {variables: Record<string, JsonValue>; tables: {orders: Record<string, JsonValue>[]}}
export interface VariableDelta {before: JsonValue | null; after: JsonValue | null; beforePresent: boolean; afterPresent: boolean}
export interface Observation {
  sequence: number; at: number; kind: 'block'; activationId: string; blockId: string; stepId: string; frameId: string; visitId: string;
  status: 'succeeded' | 'waiting' | 'failed'; outcome: string | null;
  variables: Record<string, VariableDelta>;
  tables: {orders: {inserted: Record<string, JsonValue>[]; updated: {id: string; before: Record<string, JsonValue>; after: Record<string, JsonValue>}[]; deleted: Record<string, JsonValue>[]}};
  messages: {occurrenceId: string; messageId: string; frameId: string; text: string; buttons: {buttonId: string; label: string; transition: Transition | null}[]}[];
  decision?: {evaluated: {caseId: string; variableId: string; left: JsonValue | null; operator: Condition['operator']; right: JsonValue | null; matched: boolean}[]; selectedCaseId: string | null};
  effect?: {kind: LocalAction['type'] | 'code'; attempt: number; status?: number; outcome?: string; error?: string};
  wait?: {kind: WaitDefinition['type'] | 'ask'; cause: 'suspended' | 'due' | 'timeout' | 'input' | 'event'; eventId?: string; eventName?: string};
}
export interface InputReceipt {
  disposition: 'accepted' | 'ignored' | 'duplicate' | 'rejected'; code: string;
  consumedByActivationId: string | null; observationRange: {from: number; to: number};
}
export interface TestRun {
  id: string; document: ShellDocument; messages: RunMessage[];
  phase: 'ready' | 'waiting' | 'ended' | 'limited' | 'paused' | 'failed';
  activeMessageId: string; cursor: RunCursor;
  pending: PendingReply | null;
  variables: Record<string, JsonValue>; tables: TestSeed['tables']; trace: RunTrace[];
  observations: Observation[];
  observationCheckpoint: {variables: Record<string, JsonValue>; tables: TestSeed['tables']; messageCount: number};
  suppressObservations?: boolean;
  captureByteLimit?: number;
  sequence: number; now: number; eventIds: string[]; event: {name: string; data: JsonValue} | null;
  eventFingerprints: Record<string, string>;
  failure: {activationId: string; blockId: string; attempt: number; message: string} | null;
  error: string | null;
}
export interface StepSummary {preview: string; isEntry: boolean; isTerminal: boolean; isEmpty: boolean; unassigned: number}
export interface AiRequest {requestId: string; documentId: string; baseRevision: number; prompt: string; document: ShellDocument; signal: AbortSignal}
export interface AiAdapter {apply(request: AiRequest): Promise<{candidate: ShellDocument}>}

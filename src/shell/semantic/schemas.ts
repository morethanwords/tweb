import {z} from 'zod';
import {ButtonColors, ShellLimits, type DocumentCommand, type JsonValue} from '../core/types';
import {OrdersColumns} from '../core/values';

/** Transport validation; the core validator still owns document-level invariants. */
export const SemanticOperationLimit = 100;
const id = z.string().regex(/^(?:\$[A-Za-z][A-Za-z0-9_]{0,63}|(?!(?:constructor|prototype)$)[A-Za-z][A-Za-z0-9_-]{0,63})$/);
const variableId = z.string().regex(/^(user|conversation|run|bot|event|system)\.(?!(?:constructor|prototype|__proto__)$)[A-Za-z][A-Za-z0-9_]{0,63}$/);
const text = z.string().max(ShellLimits.documentBytes);
const jsonKey = z.string().regex(/^(?!(?:__proto__|constructor|prototype)$)[\s\S]*$/);
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string().max(ShellLimits.codeValueBytes),
  z.array(jsonValueSchema).max(ShellLimits.codeValueBytes), z.record(jsonKey, jsonValueSchema)
]));
export const transitionSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('continue')}),
  z.strictObject({type: z.literal('end')}),
  z.strictObject({type: z.literal('screen'), screenId: id})
]);
const source = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('literal'), value: jsonValueSchema}),
  z.strictObject({type: z.literal('variable'), variableId})
]);
const condition = z.union([
  z.strictObject({variableId, operator: z.literal('exists')}),
  z.strictObject({variableId, operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains']), value: source})
]);
const variable = z.strictObject({id: variableId, label: text,
  scope: z.enum(['user', 'conversation', 'run', 'bot', 'event', 'system']), valueType: z.enum(['number', 'string', 'boolean', 'json'])});
const fields = z.record(z.string().regex(new RegExp(`^(?:${OrdersColumns.map(column => column.id).join('|')})$`)), source);
const action = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('set'), variableId, value: source}),
  z.strictObject({type: z.literal('increment'), variableId, amount: z.number().finite()}),
  z.strictObject({type: z.literal('table_create'), table: z.literal('orders'), values: fields, resultVariableId: variableId.nullable()}),
  z.strictObject({type: z.literal('table_find'), table: z.literal('orders'), where: fields, resultVariableId: variableId}),
  z.strictObject({type: z.literal('table_update'), table: z.literal('orders'), where: fields, values: fields, resultVariableId: variableId.nullable()}),
  z.strictObject({type: z.literal('http_mock'), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: text, headers: z.record(z.string().regex(/^[A-Za-z0-9-]+$/), text), body: jsonValueSchema,
    attempts: z.int().min(1).max(ShellLimits.httpAttempts),
    fixture: z.strictObject({status: z.int().min(100).max(599), body: jsonValueSchema,
      failuresBeforeSuccess: z.int().min(0).max(ShellLimits.httpAttempts)}), resultVariableId: variableId.nullable()})
]);
const milliseconds = z.int().min(1).max(Number.MAX_SAFE_INTEGER);
const wait = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('duration'), milliseconds, unit: z.enum(['seconds', 'minutes', 'hours', 'days'])}),
  z.strictObject({type: z.literal('date'), at: z.int().min(0).max(8_640_000_000_000_000)}),
  z.strictObject({type: z.literal('event'), name: text.min(1)}),
  z.strictObject({type: z.literal('input'), mode: z.enum(['any', 'text', 'command']), variableId: variableId.nullable()})
]);
export const blockSchema = z.discriminatedUnion('type', [
  z.strictObject({id, type: z.literal('message'), messageId: id}),
  z.strictObject({id, type: z.literal('ask'), messageId: id, variableId, answerType: z.enum(['text', 'number', 'choice']),
    choices: z.array(z.strictObject({id, label: text, value: jsonValueSchema})).max(ShellLimits.cases),
    success: transitionSchema, error: transitionSchema.nullable()}),
  z.strictObject({id, type: z.literal('decision'),
    cases: z.array(z.strictObject({id, label: text, condition, transition: transitionSchema})).max(ShellLimits.cases), otherwise: transitionSchema}),
  z.strictObject({id, type: z.literal('action'), action, success: transitionSchema, error: transitionSchema.nullable()}),
  z.strictObject({id, type: z.literal('wait'), wait, success: transitionSchema,
    timeout: z.strictObject({milliseconds, transition: transitionSchema}).nullable()}),
  z.strictObject({id, type: z.literal('code'), name: text, source: z.string().max(ShellLimits.codeBytes),
    outcomes: z.array(z.strictObject({id, name: text.min(1), transition: transitionSchema})).min(1).max(ShellLimits.outcomes),
    resultVariableId: variableId.nullable()})
]);
const keyboard = z.strictObject({
  rows: z.array(z.strictObject({id, buttonIds: z.array(id).min(1).max(ShellLimits.buttonsPerRow)})).max(ShellLimits.rows),
  buttons: z.record(id, z.strictObject({transition: transitionSchema.nullable(), color: z.enum(ButtonColors)})),
  labels: z.record(id, text)
});
export const operationSchema = z.discriminatedUnion('type', [
  z.strictObject({type: z.literal('add_folder'), folderId: id, title: text, stepId: id, messageId: id,
    fallbackStepId: id, fallbackMessageId: id, rowId: id, buttonId: id}),
  z.strictObject({type: z.literal('set_folder_title'), folderId: id, title: text}),
  z.strictObject({type: z.literal('delete_folder'), folderId: id}),
  z.strictObject({type: z.literal('move_step_to_folder'), stepId: id, folderId: id}),
  z.strictObject({type: z.literal('set_step_title'), stepId: id, title: text}),
  z.strictObject({type: z.literal('set_message_text'), stepId: id, messageId: id, text}),
  z.strictObject({type: z.literal('add_message'), stepId: id, messageId: id, afterMessageId: id.nullable(), text}),
  z.strictObject({type: z.literal('delete_message'), stepId: id, messageId: id}),
  z.strictObject({type: z.literal('add_block'), stepId: id, afterBlockId: id.nullable(), block: blockSchema, messageText: text.nullable()}),
  z.strictObject({type: z.literal('set_block'), stepId: id, block: blockSchema, messageText: text.nullable()}),
  z.strictObject({type: z.literal('delete_block'), stepId: id, blockId: id}),
  z.strictObject({type: z.literal('move_block'), stepId: id, blockId: id, index: z.int().min(0).max(ShellLimits.blocksPerStep - 1)}),
  z.strictObject({type: z.literal('set_variable'), variable}),
  z.strictObject({type: z.literal('delete_variable'), variableId}),
  z.strictObject({type: z.literal('set_entry'), stepId: id}),
  z.strictObject({type: z.literal('add_step'), stepId: id, messageId: id, afterStepId: id, content: z.strictObject({title: text, text})}),
  z.strictObject({type: z.literal('delete_step'), stepId: id}),
  z.strictObject({type: z.literal('move_step'), stepId: id, index: z.int().min(0).max(ShellLimits.steps - 1)}),
  z.strictObject({type: z.literal('set_button_transition'), buttonId: id, transition: transitionSchema.nullable()}),
  z.strictObject({type: z.literal('set_keyboard'), stepId: id, messageId: id, keyboard})
]);
export const operationsSchema = z.array(operationSchema).min(1).max(SemanticOperationLimit);
export type Operation = z.infer<typeof operationSchema>;
/** Compile-time exhaustiveness in both directions, including nested block definitions. */
type Assert<T extends true> = T;
export type OperationContract = Assert<DocumentCommand extends Operation ? Operation extends DocumentCommand ? true : false : false>;

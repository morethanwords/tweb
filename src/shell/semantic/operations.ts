import {command, createEditor} from '../core/editor';
import {validateDocument, validId} from '../core/document';
import type {Block, DocumentCommand, ShellDocument, Transition} from '../core/types';
import {operationsSchema} from './schemas';

export class SemanticOperationError extends Error {
  constructor(public readonly code: 'INVALID_OPERATIONS' | 'INVALID_REFERENCE' | 'OPERATION_REJECTED',
    message: string, public readonly operationIndex: number) {
    super(message);
    this.name = 'SemanticOperationError';
  }
}

/** Apply only on detached editor state. A rejected member makes the entire batch unavailable. */
export function applyOperations(document: ShellDocument, operations: DocumentCommand[],
  allocateId?: (placeholder: string) => string): {document: ShellDocument; idMap: Record<string, string>} {
  const parsed = operationsSchema.safeParse(operations);
  if(!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new SemanticOperationError('INVALID_OPERATIONS', issue.message, typeof issue.path[0] === 'number' ? issue.path[0] : -1);
  }
  let state = createEditor(document);
  const idMap: Record<string, string> = {};
  const resolvedIds = new Set<string>([
    document.id, ...Object.keys(document.folders), ...Object.keys(document.steps), ...Object.keys(document.blocks),
    ...Object.keys(document.messages), ...Object.keys(document.buttons),
    ...Object.values(document.messages).flatMap(message => message.rows.map(row => row.id)),
    ...Object.values(document.blocks).flatMap(block => block.type === 'ask' ? block.choices.map(choice => choice.id) :
      block.type === 'decision' ? block.cases.map(item => item.id) : block.type === 'code' ? block.outcomes.map(outcome => outcome.id) : [])
  ]);
  function resolve(value: string): string {
    if(!value.startsWith('$')) return value;
    if(Object.hasOwn(idMap, value)) return idMap[value];
    if(!allocateId) throw new Error(`No allocator for ${value}`);
    const allocated = allocateId(value);
    validId(allocated, 'allocatedId');
    if(resolvedIds.has(allocated)) throw new Error('An allocated ID must be new and unique to its placeholder.');
    resolvedIds.add(allocated);
    idMap[value] = allocated;
    return allocated;
  }
  function transition(value: Transition | null): Transition | null {
    return value?.type === 'screen' ? {...value, screenId: resolve(value.screenId)} : value;
  }
  function block(value: Block): Block {
    const result = {...value, id: resolve(value.id)};
    switch(result.type) {
      case 'message': return {...result, messageId: resolve(result.messageId)};
      case 'ask': return {...result, messageId: resolve(result.messageId), choices: result.choices.map(choice => ({...choice, id: resolve(choice.id)})),
        success: transition(result.success)!, error: transition(result.error)};
      case 'decision': return {...result, cases: result.cases.map(item => ({...item, id: resolve(item.id), transition: transition(item.transition)!})), otherwise: transition(result.otherwise)!};
      case 'action': return {...result, success: transition(result.success)!, error: transition(result.error)};
      case 'wait': return {...result, success: transition(result.success)!, timeout: result.timeout && {...result.timeout, transition: transition(result.timeout.transition)!}};
      case 'code': return {...result, outcomes: result.outcomes.map(item => ({...item, id: resolve(item.id), transition: transition(item.transition)!}))};
    }
  }
  function resolveOperation(operation: DocumentCommand): DocumentCommand {
    const result = {...operation};
    // Only declared identity fields are substituted; text, source, labels and literal JSON are data.
    for(const key of ['folderId', 'stepId', 'messageId', 'fallbackStepId', 'fallbackMessageId', 'rowId', 'buttonId', 'blockId', 'afterStepId', 'afterMessageId', 'afterBlockId'] as const) {
      if(key in result) {
        const record = result as unknown as Record<string, unknown>;
        if(typeof record[key] === 'string') record[key] = resolve(record[key]);
      }
    }
    switch(result.type) {
      case 'add_block': case 'set_block': return {...result, block: block(result.block)};
      case 'set_button_transition': return {...result, transition: transition(result.transition)};
      case 'set_keyboard': return {...result, keyboard: {
        rows: result.keyboard.rows.map(row => ({id: resolve(row.id), buttonIds: row.buttonIds.map(resolve)})),
        buttons: Object.fromEntries(Object.entries(result.keyboard.buttons).map(([id, button]) => [resolve(id), {...button, transition: transition(button.transition)}])),
        labels: Object.fromEntries(Object.entries(result.keyboard.labels).map(([id, label]) => [resolve(id), label]))
      }};
      default: return result;
    }
  }
  for(const [index, operation] of parsed.data.entries()) {
    let resolved: DocumentCommand;
    try {resolved = resolveOperation(operation);}
    catch(error) {throw new SemanticOperationError('INVALID_REFERENCE', error instanceof Error ? error.message : 'Invalid reference.', index);}
    const next = command(state, resolved, state.revision);
    if(next.error) throw new SemanticOperationError('OPERATION_REJECTED', next.error, index);
    // The service owns the single transaction/undo boundary; intermediate editor histories are disposable.
    state = {...next, history: []};
  }
  return {document: validateDocument(state.document), idMap};
}

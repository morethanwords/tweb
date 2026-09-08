import {describe, expect, it} from 'vitest';
import {createFixture} from '../core/fixture';
import type {DocumentCommand} from '../core/types';
import {applyOperations, SemanticOperationError} from './operations';
import {operationSchema, operationsSchema} from './schemas';

const allocate = (name: string) => `allocated-${name.slice(1)}`;

describe('semantic operation boundary', () => {
  it('rejects unknown fields at every boundary and unknown operation types', () => {
    expect(operationSchema.safeParse({type: 'set_step_title', stepId: 'start', title: 'New', unsafe: true}).success).toBe(false);
    expect(operationSchema.safeParse({type: 'set_button_transition', buttonId: 'start-menu', transition: {type: 'end', screenId: 'menu'}}).success).toBe(false);
    expect(operationSchema.safeParse({type: 'replace_document', document: createFixture()}).success).toBe(false);
    expect(operationsSchema.safeParse([]).success).toBe(false);
    expect(operationsSchema.safeParse(Array.from({length: 101}, () => ({type: 'set_entry', stepId: 'start'}))).success).toBe(false);
  });

  it('does not expose partial changes when a second operation fails', () => {
    const document = createFixture(), before = structuredClone(document);
    try {
      applyOperations(document, [{type: 'set_step_title', stepId: 'start', title: 'Changed'},
        {type: 'set_button_transition', buttonId: 'start-menu', transition: {type: 'screen', screenId: 'missing'}}]);
      throw new Error('Expected rejection');
    } catch(error) {
      expect(error).toBeInstanceOf(SemanticOperationError);
      expect((error as SemanticOperationError).operationIndex).toBe(1);
    }
    expect(document).toEqual(before);
  });

  it('creates forward and cyclic links using create-before-use and stable placeholders', () => {
    const document = createFixture();
    const operations: DocumentCommand[] = [
      {type: 'add_step', stepId: '$screen', messageId: '$message', afterStepId: 'start', content: {title: 'New', text: '$screen is ordinary content'}},
      {type: 'set_button_transition', buttonId: 'start-menu', transition: {type: 'screen', screenId: '$screen'}},
      {type: 'set_keyboard', stepId: '$screen', messageId: '$message', keyboard: {
        rows: [{id: '$row', buttonIds: ['$back']}], buttons: {$back: {transition: {type: 'screen', screenId: 'start'}, color: 'default'}}, labels: {$back: '$screen is a label'}
      }}
    ];
    const result = applyOperations(document, operations, allocate);
    expect(result).toEqual(applyOperations(document, operations, allocate));
    expect(result.idMap).toEqual({$screen: 'allocated-screen', $message: 'allocated-message', $row: 'allocated-row', $back: 'allocated-back'});
    expect(result.document.content.messages['allocated-message']).toBe('$screen is ordinary content');
    expect(result.document.content.buttons['allocated-back']).toBe('$screen is a label');
    expect(result.document.buttons['allocated-back'].transition).toEqual({type: 'screen', screenId: 'start'});
    expect(document.steps['allocated-screen']).toBeUndefined();
    expect(() => applyOperations(document, [operations[1], operations[0]], allocate)).toThrow(SemanticOperationError);
  });

  it('rejects invalid allocator IDs, collisions and unresolved placeholders', () => {
    const operation: DocumentCommand = {type: 'add_step', stepId: '$screen', messageId: '$message', afterStepId: 'start', content: {title: 'New', text: 'New'}};
    for(const allocator of [undefined, () => 'start', () => 'same', () => 'constructor', () => '$other']) {
      expect(() => applyOperations(createFixture(), [operation], allocator)).toThrow(SemanticOperationError);
    }
  });

  it('accepts sparse table fields and leaves typed references under core authority', () => {
    const operations: DocumentCommand[] = [{type: 'add_block', stepId: 'start', afterBlockId: 'start-message', messageText: null,
      block: {type: 'action', id: 'insert-order', action: {type: 'table_create', table: 'orders', values: {amount: {type: 'literal', value: 10}}, resultVariableId: null}, success: {type: 'continue'}, error: null}}];
    expect(operationsSchema.safeParse(operations).success).toBe(true);
    expect(applyOperations(createFixture(), operations).document.blocks['insert-order']).toEqual(operations[0].type === 'add_block' ? operations[0].block : undefined);
    expect(() => applyOperations(createFixture(), [{type: 'add_block', stepId: 'start', afterBlockId: null, messageText: null,
      block: {id: 'bad-variable', type: 'action', action: {type: 'increment', variableId: 'user.missing', amount: 1}, success: {type: 'end'}, error: null}}])).toThrow(SemanticOperationError);
  });
});

import {describe, expect, it} from 'vitest';
import {createFixture} from '../core/fixture';
import type {DocumentCommand} from '../core/types';
import {applyOperations} from './operations';
import {compileSemantic, entityKey, inspectSemantic, searchSemantic, semanticDiff} from './compiler';

function withSemantics() {
  const operations: DocumentCommand[] = [
    {type: 'set_variable', variable: {id: 'user.balance', scope: 'user', label: 'Баланс', valueType: 'number'}},
    {type: 'set_variable', variable: {id: 'run.result', scope: 'run', label: 'Результат', valueType: 'json'}},
    {type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Ваш баланс: {{user.balance}}'},
    {type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard: {rows: [{id: 'start-actions', buttonIds: ['start-menu']}],
      buttons: {'start-menu': {transition: {type: 'screen', screenId: 'menu'}, color: 'default'}}, labels: {'start-menu': 'Баланс {{user.balance}}'}}},
    {type: 'add_block', stepId: 'start', afterBlockId: 'start-message', messageText: null, block: {
      id: 'credit', type: 'action', action: {type: 'increment', variableId: 'user.balance', amount: 10}, success: {type: 'continue'}, error: null}},
    {type: 'add_block', stepId: 'start', afterBlockId: 'credit', messageText: null, block: {
      id: 'opaque', type: 'code', name: 'Opaque calculation', source: "return {outcome: 'done', value: context.user.balance};", resultVariableId: 'run.result',
      outcomes: [{id: 'done', name: 'done', transition: {type: 'end'}}]}},
    {type: 'add_block', stepId: 'menu', afterBlockId: 'menu-message', messageText: null, block: {
      id: 'other-code', type: 'code', name: 'Other calculation', source: "return {outcome: 'done'};", resultVariableId: null,
      outcomes: [{id: 'done', name: 'done', transition: {type: 'end'}}]}}
  ];
  return applyOperations(createFixture(), operations).document;
}

describe('semantic projection', () => {
  it('is detached, deterministic and derives memberships, fallbacks, reads and writes', () => {
    const document = withSemantics(), snapshot = compileSemantic(document);
    expect(snapshot).toEqual(compileSemantic(document));
    expect(snapshot.edges).toContainEqual({kind: 'fallback', from: {kind: 'screen', id: 'start'}, to: {kind: 'screen', id: 'start-fallback'}, label: 'Неизвестный ввод'});
    for(const from of [{kind: 'message', id: 'start-message'}, {kind: 'button', id: 'start-menu'}, {kind: 'block', id: 'credit'}]) {
      expect(snapshot.edges).toContainEqual({kind: 'reads', from, to: {kind: 'variable', id: 'user.balance'}});
    }
    expect(snapshot.edges).toContainEqual({kind: 'writes', from: {kind: 'block', id: 'credit'}, to: {kind: 'variable', id: 'user.balance'}});
    const inspected = inspectSemantic(snapshot, {kind: 'message', id: 'start-message'})!;
    (inspected.entity.content as {text: string}).text = 'Mutated';
    expect(document.content.messages['start-message']).toBe('Ваш баланс: {{user.balance}}');
    expect(inspectSemantic(snapshot, {kind: 'message', id: 'start-message'})!.entity.text).toBe('Ваш баланс: {{user.balance}}');
  });

  it('keeps Code opaque, declares only its result writes and scopes outcome identities', () => {
    const snapshot = compileSemantic(withSemantics());
    expect(snapshot.opaqueCode).toContainEqual({kind: 'block', id: 'opaque'});
    expect(snapshot.edges.some(edge => edge.from.id === 'opaque' && edge.kind === 'reads')).toBe(false);
    expect(snapshot.edges).toContainEqual({kind: 'writes', from: {kind: 'block', id: 'opaque'}, to: {kind: 'variable', id: 'run.result'}});
    expect(snapshot.diagnostics.some(item => item.entity.id === 'opaque' && item.code === 'OPAQUE_CODE_DEPENDENCIES')).toBe(true);
    expect(inspectSemantic(snapshot, {kind: 'outcome', id: 'done'})).toBeNull();
    expect(inspectSemantic(snapshot, {kind: 'outcome', id: 'done', parentId: 'opaque'})).not.toBeNull();
    expect(entityKey({kind: 'outcome', id: 'done', parentId: 'opaque'})).not.toBe(entityKey({kind: 'outcome', id: 'done', parentId: 'other-code'}));
  });

  it('bounds search context, reports match reasons and reserves complete Code for inspect', () => {
    const snapshot = compileSemantic(withSemantics());
    const hits = searchSemantic(snapshot, 'user.balance', 2);
    expect(hits).toHaveLength(2);
    expect(hits.every(hit => hit.contentComplete === false && hit.preview.length <= 240)).toBe(true);
    expect(searchSemantic(snapshot, 'user.balance', 100).find(hit => hit.ref.id === 'credit')?.matchedFields).toEqual(['reads', 'writes']);
    expect(JSON.stringify(searchSemantic(snapshot, 'opaque'))).not.toContain('context.user.balance');
    expect(inspectSemantic(snapshot, {kind: 'block', id: 'opaque'})!.entity.execution).toMatchObject({source: expect.stringContaining('context.user.balance')});
    expect(() => searchSemantic(snapshot, 'a', 101)).toThrow();
    expect(() => searchSemantic(snapshot, 'a'.repeat(513))).toThrow();
  });

  it('distinguishes content, navigation and execution without identity churn', () => {
    const before = createFixture();
    const renamed = applyOperations(before, [{type: 'set_step_title', stepId: 'start', title: 'Название'}]).document;
    expect(semanticDiff(before, renamed).map(change => [change.ref.kind, change.categories])).toEqual([['screen', ['content']]]);
    const reordered = applyOperations(before, [{type: 'move_step', stepId: 'offer', index: 0}]).document;
    expect(semanticDiff(before, reordered).every(change => change.categories.every(category => category === 'navigation'))).toBe(true);
    const rewired = applyOperations(before, [{type: 'set_button_transition', buttonId: 'start-menu', transition: {type: 'screen', screenId: 'offer'}}]).document;
    expect(semanticDiff(before, rewired).map(change => [change.ref.id, change.categories])).toEqual([['start-menu', ['execution']]]);
  });

  it('rejects invalid source documents and does not assert that structural cycles are hot loops', () => {
    const document = createFixture();
    document.buttons['start-menu'].transition = {type: 'screen', screenId: 'missing'};
    expect(() => compileSemantic(document)).toThrow();
    expect(compileSemantic(createFixture()).diagnostics.filter(item => item.code === 'POSSIBLE_CYCLE').every(item => item.severity === 'info')).toBe(true);
  });
  it('keeps long event names inspectable through a bounded composite reference', () => {
    const document=applyOperations(createFixture(),[{type:'add_block',stepId:'start',afterBlockId:null,messageText:null,
      block:{type:'wait',id:'subscription',wait:{type:'event',name:'name'.repeat(2000)},success:{type:'continue'},timeout:null}}]).document;
    const snapshot=compileSemantic(document),event=inspectSemantic(snapshot,{kind:'event',id:'event',parentId:'subscription'});
    expect(event?.entity.execution).toMatchObject({name:'name'.repeat(2000)});
    expect(searchSemantic(snapshot,'namename').find(hit=>hit.ref.kind==='event')?.ref).toEqual({kind:'event',id:'event',parentId:'subscription'});
  });
});

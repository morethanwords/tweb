import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {serializeDocument, validateDocument} from './document';
import {allStepIds} from './navigation';
import {ShellLimits} from './types';
import type {ShellDocument} from './types';

function largeDocument(stepCount: number, buttonCount: number): ShellDocument {
  const document = createFixture();
  const steps = Array.from({length: stepCount}, (_, index) => `step-${index}`);
  document.entryStepId = steps[0];
  document.nextStepNumber = stepCount + 1;
  document.steps = {}; document.messages = {}; document.blocks = {};
  document.buttons = {};
  document.folderOrder = ['main'];
  document.folders = {main: {stepIds: steps.slice(0, -1), fallbackStepId: steps.at(-1)!}};
  document.content = {folders: {main: {title: 'Main'}}, steps: {}, messages: {}, buttons: {}};
  steps.forEach((stepId, index) => {
    document.steps[stepId] = {number: index + 1, blockIds: [`${stepId}-message`]};
    document.blocks[`${stepId}-message`] = {id: `${stepId}-message`, type: 'message', messageId: `${stepId}-message`};
    document.messages[`${stepId}-message`] = {rows: []};
    document.content.steps[stepId] = {title: stepId};
    document.content.messages[`${stepId}-message`] = `Содержимое ${stepId}`;
  });
  for(let index = 0; index < buttonCount; index++) {
    const stepId = steps[Math.floor(index / 64)];
    const rows = document.messages[`${stepId}-message`].rows;
    if(index % 8 === 0) rows.push({id: `row-${index}`, buttonIds: []});
    const id = `button-${index}`;
    rows[rows.length - 1].buttonIds.push(id);
    document.buttons[id] = {transition: {type: 'screen', screenId: document.entryStepId}, color: 'default'};
    document.content.buttons[id] = id;
  }
  return document;
}

describe('document boundary', () => {
  it('migrates a valid v5 snapshot once while preserving authored IDs, folders and explicit button destinations', () => {
    const current = createFixture();
    const legacy: Record<string, unknown> = {...current, schemaVersion: 5,
      steps: Object.fromEntries(Object.entries(current.steps).map(([id, step]) => [id, {number: step.number, messageIds: [...step.blockIds]}])),
      buttons: Object.fromEntries(Object.entries(current.buttons).map(([id, button]) => [id, {color: button.color,
        targetStepId: button.transition?.type === 'screen' ? button.transition.screenId : null}]))};
    delete legacy.blocks; delete legacy.variables;
    const before = JSON.stringify(legacy);
    const migrated = validateDocument(legacy);
    expect(migrated).toEqual(current);
    expect(migrated.blocks['start-message']).toEqual({id: 'start-message', type: 'message', messageId: 'start-message'});
    expect(migrated.buttons['start-offer'].transition).toEqual({type: 'screen', screenId: 'offer'});
    expect(JSON.stringify(legacy)).toBe(before);
    expect(serializeDocument(validateDocument(migrated))).toBe(serializeDocument(current));
  });

  it('returns detached native data and preserves public content, branches and loops', () => {
    const input = createFixture();
    const document = validateDocument(input);
    document.messages['start-message'].rows[0].buttonIds.reverse();
    document.content.messages['start-message'] = 'Изменено';
    expect(input.content.messages['start-message']).not.toBe('Изменено');
    expect(input.messages['start-message'].rows[0].buttonIds).toEqual(['start-offer', 'start-menu']);
    expect(allStepIds(document)).toHaveLength(7);
    expect(document.buttons['menu-start'].transition).toEqual({type: 'screen', screenId: 'start'});
  });

  it('canonicalizes all maps in visual order with one trailing newline', () => {
    const original = createFixture();
    const shuffled = {...original, steps: Object.fromEntries(Object.entries(original.steps).reverse()), buttons: Object.fromEntries(Object.entries(original.buttons).reverse()), content: {
      folders: original.content.folders,
      messages: Object.fromEntries(Object.entries(original.content.messages).reverse()),
      steps: Object.fromEntries(Object.entries(original.content.steps).reverse()),
      buttons: Object.fromEntries(Object.entries(original.content.buttons).reverse())
    }};
    expect(serializeDocument(shuffled)).toBe(serializeDocument(original));
    expect(serializeDocument(original).endsWith('\n')).toBe(true);
    expect(validateDocument(JSON.parse(serializeDocument(original)))).toEqual(original);
  });

  it('preserves stable screen numbers and validates gaps, uniqueness and the monotonic high-water mark', () => {
    const gap = createFixture();
    gap.steps.details.number = 8; gap.nextStepNumber = 9;
    expect(validateDocument(gap).steps.details.number).toBe(8);
    for(const number of [0, -1, 1.5, ShellLimits.stepNumber + 1]) {
      const invalid = createFixture(); invalid.steps.details.number = number;
      expect(() => validateDocument(invalid)).toThrow();
    }
    const duplicate = createFixture(); duplicate.steps.details.number = 2;
    expect(() => validateDocument(duplicate)).toThrow(/номер экрана уже используется/);
    const stale = createFixture(); stale.nextStepNumber = 5;
    expect(() => validateDocument(stale)).toThrow(/больше всех выданных/);
  });

  it.each([
    ['root', (doc: ShellDocument) => Object.assign(doc, {extra: true})],
    ['profile', (doc: ShellDocument) => Object.assign(doc.bot, {phone: 'secret'})],
    ['step', (doc: ShellDocument) => Object.assign(doc.steps.start, {network: true})],
    ['row', (doc: ShellDocument) => Object.assign(doc.messages['start-message'].rows[0], {layout: 'custom'})],
    ['button', (doc: ShellDocument) => Object.assign(doc.buttons['start-offer'], {url: 'https://example.com'})],
    ['content root', (doc: ShellDocument) => Object.assign(doc.content, {images: []})],
    ['step content', (doc: ShellDocument) => Object.assign(doc.content.steps.start, {html: '<b>text</b>'})]
  ])('rejects unknown keys at %s', (_, mutate) => {
    const document = createFixture();
    mutate(document);
    expect(() => validateDocument(document)).toThrow();
  });

  it.each([null, [], new Date(), false, 42, 'document'])('rejects a non-document value: %s', (input) => {
    expect(() => validateDocument(input)).toThrow();
  });

  it('rejects unknown schema, duplicate ordering, missing entry and orphan content', () => {
    const schema = {...createFixture(), schemaVersion: 4};
    expect(() => validateDocument(schema)).toThrow(/версии 5 и 6/);
    const duplicate = createFixture();
    duplicate.folders['start-folder'].stepIds.push('start');
    expect(() => validateDocument(duplicate)).toThrow(/повторов/);
    expect(() => validateDocument({...createFixture(), entryStepId: 'missing'})).toThrow(/начальный шаг/);
    const orphan = createFixture();
    orphan.content.steps.orphan = {title: ''};
    orphan.content.messages['orphan-message'] = '';
    expect(() => validateDocument(orphan)).toThrow(/соответствовать/);
  });

  it('rejects duplicate ownership, orphan button, missing label and duplicate row IDs', () => {
    const duplicate = createFixture();
    duplicate.messages['menu-message'].rows[0].buttonIds.push('start-offer');
    expect(() => validateDocument(duplicate)).toThrow(/больше одного раза/);
    const orphan = createFixture();
    orphan.buttons.orphan = {transition: null, color: 'default'};
    orphan.content.buttons.orphan = 'Нет владельца';
    expect(() => validateDocument(orphan)).toThrow(/принадлежать/);
    const missing = createFixture();
    delete missing.content.buttons['start-offer'];
    expect(() => validateDocument(missing)).toThrow(/соответствовать/);
    const rows = createFixture();
    rows.messages['menu-message'].rows[0].id = 'start-actions';
    expect(() => validateDocument(rows)).toThrow(/ряда уже/);
  });

  it('allows visibly incomplete draft copy and null targets, rejects dangling non-null targets', () => {
    const draft = createFixture();
    draft.content.messages['start-message'] = '';
    draft.content.buttons['start-offer'] = '';
    draft.buttons['start-offer'].transition = null;
    expect(validateDocument(draft)).toEqual(draft);
    draft.buttons['start-offer'].transition = {type: 'screen', screenId: 'missing'};
    expect(() => validateDocument(draft)).toThrow(/целевой экран/);
  });

  it('preserves plain text exactly, including markup, CRLF and composed Unicode', () => {
    const document = createFixture();
    const text = '<script>alert(1)</script>\r\n👩🏽‍💻 е\u0308 & <b>текст</b>';
    document.content.messages['start-message'] = text;
    expect(validateDocument(document).content.messages['start-message']).toBe(text);
    expect(JSON.parse(serializeDocument(document)).content.messages['start-message']).toBe(text);
  });

  it('rejects prototype keys and inherited records without executing accessors', () => {
    const document = createFixture();
    Object.defineProperty(document.buttons, '__proto__', {value: {transition: null, color: 'default'}, enumerable: true});
    expect(() => validateDocument(document)).toThrow();
    expect(() => validateDocument({...createFixture(), id: 'constructor'})).toThrow();
    expect(() => validateDocument(Object.create(createFixture()))).toThrow();
    const getter = createFixture();
    let executions = 0;
    Object.defineProperty(getter.bot, 'title', {get: () => { executions++; return 'bad'; }, enumerable: true});
    expect(() => validateDocument(getter)).toThrow();
    expect(executions).toBe(0);
  });

  it('rejects sparse arrays, accessor elements and hidden or symbolic fields', () => {
    const sparse = createFixture();
    delete sparse.folders['start-folder'].stepIds[1];
    expect(() => validateDocument(sparse)).toThrow();
    const getter = createFixture();
    let executions = 0;
    Object.defineProperty(getter.folders['start-folder'].stepIds, '0', {get: () => { executions++; return 'start'; }, enumerable: true});
    expect(() => validateDocument(getter)).toThrow();
    expect(executions).toBe(0);
    const hidden = createFixture();
    Object.defineProperty(hidden, 'hidden', {value: 'ignored', enumerable: false});
    expect(() => validateDocument(hidden)).toThrow();
    const symbol = createFixture();
    Object.defineProperty(symbol, Symbol('hidden'), {value: true});
    expect(() => validateDocument(symbol)).toThrow();
  });

  it('accepts exact topology limits and rejects the next step/button', () => {
    expect(allStepIds(validateDocument(largeDocument(ShellLimits.steps, ShellLimits.buttons)))).toHaveLength(100);
    expect(() => validateDocument(largeDocument(ShellLimits.steps + 1, 0))).toThrow();
    expect(() => validateDocument(largeDocument(ShellLimits.steps, ShellLimits.buttons + 1))).toThrow();
  });

  it('rejects empty rows, nine rows and nine buttons in one row', () => {
    const empty = createFixture();
    empty.messages['start-message'].rows.push({id: 'empty', buttonIds: []});
    expect(() => validateDocument(empty)).toThrow(/пустой ряд/);
    const rows = largeDocument(100, 65);
    rows.messages['step-0-message'].rows.push(rows.messages['step-1-message'].rows[0]);
    rows.messages['step-1-message'].rows = [];
    expect(() => validateDocument(rows)).toThrow(/максимум 8/);
    const buttons = largeDocument(100, 9);
    buttons.messages['step-0-message'].rows[0].buttonIds.push('button-8');
    buttons.messages['step-0-message'].rows.pop();
    expect(() => validateDocument(buttons)).toThrow(/максимум 8/);
  });

  it('bounds actual UTF-8 export bytes, including JSON escaping', () => {
    const document = createFixture();
    document.content.messages['start-message'] = 'я'.repeat(ShellLimits.documentBytes / 2);
    expect(() => validateDocument(document)).toThrow(/1 MiB/);
    document.content.messages['start-message'] = '\u0000'.repeat(ShellLimits.documentBytes / 5);
    expect(() => validateDocument(document)).toThrow(/1 MiB/);
  });
});

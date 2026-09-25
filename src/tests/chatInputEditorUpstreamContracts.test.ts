import rootScope from '@lib/rootScope';
import I18n from '@lib/langPack';
import {canonicalOrderedListType} from '@lib/richTextProcessor/orderedList';
import type {JSONContent} from '@tiptap/core';
import {AllSelection, EditorState, NodeSelection, TextSelection} from '@tiptap/pm/state';
import {CellSelection} from '@tiptap/pm/tables';
import '@/tests/mocks/chatInputEditorEngineUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import {CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS, chatInputPlaceholdersKey} from '@components/chat/inputEditor/placeholders';

// Behavioral cases adapted to the production schema from Tiptap v3.28.0:
// packages/extension-list/__tests__/{listItemDelete,taskItem}.spec.ts
// packages/core/__tests__/{can,getMarkRange,extendMarkRange,insertContentAt}.spec.ts
// https://github.com/ueberdosis/tiptap/tree/c5f4b576eb2d521364bba524616e0702027987d3

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({type: 'text', text: value, ...(marks ? {marks} : {})});
const paragraph = (value = ''): JSONContent => ({type: 'paragraph', content: value ? [text(value)] : undefined});
const listTypes = ['bulletList', 'orderedList', 'taskList'] as const;
type ListType = typeof listTypes[number];
const item = (type: ListType, value: string, children: JSONContent[] = []): JSONContent => ({
  type: type === 'taskList' ? 'taskItem' : 'listItem', content: [paragraph(value), ...children]
});
const list = (type: ListType, content: JSONContent[]): JSONContent => ({type, content});
const table = (): JSONContent => ({type: 'chatTableWrapper', content: [
  {type: 'chatTableTitle', content: [text('Metrics')]},
  {type: 'table', content: [1, 2, 3].map((row) => ({type: 'tableRow', content: ['A', 'B', 'C'].map((column, index) => ({
    type: 'tableCell', attrs: {colwidth: [(index + 1) * 100]}, content: [paragraph(`${column}${row}`)]
  }))}))}
]});

describe('upstream editor behavior through the tweb schema', () => {
  const mounted: ReturnType<typeof mountChatInputEditor>[] = [];
  function setup(content: JSONContent[]) {
    const result = mountChatInputEditor({enableBlockSelection: false});
    mounted.push(result);
    expect(result.editor.setDocument({type: 'doc', content})).toBe(true);
    return result;
  }
  afterEach(async() => {
    mounted.splice(0).forEach(({editor, input}) => {editor.destroy(); input.remove();});
    await vi.dynamicImportSettled();
  });
  function selectText(result: ReturnType<typeof setup>, value: string, edge: 'start' | 'end' = 'start') {
    let found: number;
    result.tiptap.state.doc.descendants((node, position) => {
      if(node.isText && node.text === value) found = position + (edge === 'end' ? value.length : 0);
    });
    expect(found).toBeDefined();
    result.editor.restoreSelection({from: found, to: found}, false);
    return found;
  }
  function key(result: ReturnType<typeof setup>, key: string) {
    return result.tiptap.view.someProp('handleKeyDown', (handler) => handler(
      result.tiptap.view,
      new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})
    ));
  }
  function roundTrip(result: ReturnType<typeof setup>, before: JSONContent, after: JSONContent) {
    expect(result.editor.undo()).toBe(true);
    expect(result.editor.getDocument()).toEqual(before);
    expect(result.editor.redo()).toBe(true);
    expect(result.editor.getDocument()).toEqual(after);
    expect(() => result.tiptap.state.doc.check()).not.toThrow();
  }

  test.each(listTypes)('Delete hoists a branching %s and a second Delete keeps descendants', (type) => {
    const result = setup([list(type, [
      item(type, 'A', [list(type, [
        item(type, 'B', [list(type, [item(type, 'C'), item(type, 'D')])]),
        item(type, 'E')
      ])]),
      item(type, 'F')
    ])]);
    selectText(result, 'A', 'end');
    const before = result.editor.getDocument();
    expect(key(result, 'Delete')).toBe(true);
    expect(result.tiptap.state.selection).toBeInstanceOf(TextSelection);
    const root = result.editor.getDocument().content![0];
    expect(root.content?.map((child) => child.content?.[0].content?.[0].text)).toEqual(['A', 'B', 'E', 'F']);
    expect(root.content?.[1].content?.[1].content).toHaveLength(2);
    const after = result.editor.getDocument();
    roundTrip(result, before, after);
    selectText(result, 'A', 'end');
    result.editor.separateHistory();
    expect(key(result, 'Delete')).toBe(true);
    expect(result.tiptap.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(result.tiptap.state.doc.textContent).toBe('ABCDEF');
    expect(result.editor.getDocument()).not.toEqual(after);
    roundTrip(result, after, result.editor.getDocument());
  });

  test.each(listTypes)('two Backspaces lift then merge a non-first %s item', (type) => {
    const result = setup([list(type, [item(type, 'A'), item(type, 'B')])]);
    selectText(result, 'B');
    const before = result.editor.getDocument();
    expect(key(result, 'Backspace')).toBe(true);
    expect(result.editor.getDocument().content?.map(({type}) => type)).toEqual([type, 'paragraph']);
    expect(result.tiptap.state.selection.$from.parent.textContent).toBe('B');
    const lifted = result.editor.getDocument();
    roundTrip(result, before, lifted);
    selectText(result, 'B');
    result.editor.separateHistory();
    expect(key(result, 'Backspace')).toBe(true);
    expect(result.editor.getDocument().content).toHaveLength(1);
    expect(result.tiptap.state.doc.textContent).toBe('AB');
    expect(result.tiptap.state.selection).toBeInstanceOf(TextSelection);
    roundTrip(result, lifted, result.editor.getDocument());
  });

  for(const type of listTypes) for(const tail of ['', 'tail']) {
    test(`Backspace joins a continuation paragraph inside ${type} (tail=${JSON.stringify(tail)})`, () => {
      const result = setup([list(type, [item(type, 'first'), item(type, '13232', [paragraph(tail)])])]);
      const root = result.tiptap.state.doc.firstChild!;
      const position = 1 + root.child(0).nodeSize + 1 + root.child(1).child(0).nodeSize + 1;
      result.editor.restoreSelection({from: position, to: position}, false);
      const before = result.editor.getDocument();
      expect(key(result, 'Backspace')).toBe(true);
      const after = result.editor.getDocument();
      expect(after.content).toHaveLength(1);
      expect(after.content?.[0].type).toBe(type);
      expect(after.content?.[0].content).toHaveLength(2);
      expect(after.content?.[0].content?.[1].content).toEqual([paragraph(`13232${tail}`)]);
      expect(result.tiptap.state.selection.$from.parentOffset).toBe(5);
      roundTrip(result, before, after);
    });
  }

  for(const from of listTypes) for(const to of listTypes) test(`Select All converts ${from} to ${to} and subsequent Backspace clears all text`, () => {
    const result = setup([list(from, [item(from, 'A'), item(from, 'B')])]);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(new AllSelection(result.tiptap.state.doc)));
    const before = result.editor.getDocument();
    expect(to === 'bulletList' ? result.editor.toggleBulletList() : to === 'orderedList' ?
      result.editor.toggleOrderedList() : result.editor.toggleTaskList()).toBe(true);
    const after = result.editor.getDocument();
    expect(after.content?.[0].type).toBe(from === to ? 'paragraph' : to);
    expect(result.editor.getSelectedText()).toContain('A');
    expect(result.editor.getSelectedText()).toContain('B');
    roundTrip(result, before, after);
    result.editor.separateHistory();
    expect(key(result, 'Backspace')).toBe(true);
    expect(result.editor.getDocument()).toEqual({type: 'doc', content: [paragraph()]});
    expect(result.tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(result.tiptap.state.selection.empty).toBe(true);
  });

  test('does not offer a single existing link for a range crossing different URLs', () => {
    const {editor} = setup([{type: 'paragraph', content: [
      text('abc', [{type: 'link', attrs: {href: 'https://a.example'}}]),
      text('def', [{type: 'link', attrs: {href: 'https://b.example'}}])
    ]}]);
    editor.restoreSelection({from: 2, to: 6}, false);
    expect(editor.getSelectedLink()).toBeUndefined();
  });

  test('extends a collapsed link range across formatting but stops before another URL', () => {
    const {editor} = setup([{type: 'paragraph', content: [
      text('abc', [{type: 'link', attrs: {href: 'https://a.example'}}]),
      text('def', [{type: 'bold'}, {type: 'link', attrs: {href: 'https://a.example'}}]),
      text('ghi', [{type: 'link', attrs: {href: 'https://b.example'}}])
    ]}]);
    editor.restoreSelection({from: 5, to: 5}, false);
    expect(editor.getSelectedLink()).toEqual({from: 1, to: 7, text: 'abcdef', url: 'https://a.example'});
  });

  test.each(listTypes)('updates %s checkbox editability without replacing its node', (type) => {
    const entry = item(type, 'Task');
    entry.attrs = {checkbox: true, checked: false};
    const {editor, input} = setup([list(type, [entry])]);
    const checkbox = input.querySelector<HTMLButtonElement>('button[role="checkbox"]')!;
    expect(checkbox.disabled).toBe(false);
    editor.setEditable(false);
    expect(input.querySelector('button[role="checkbox"]')).toBe(checkbox);
    expect(checkbox.disabled).toBe(true);
    const before = editor.getDocument();
    checkbox.click();
    expect(editor.getDocument()).toEqual(before);
    editor.setEditable(true);
    expect(checkbox.disabled).toBe(false);
    checkbox.click();
    expect(editor.getDocument().content?.[0].content?.[0].attrs?.checked).toBe(true);
  });

  test.each([0, 2, 5])('inserts marked inline text at paragraph offset %i without splitting the paragraph', (offset) => {
    const result = setup([paragraph('ABCDE')]);
    result.editor.restoreSelection({from: offset + 1, to: offset + 1}, false);
    const before = result.editor.getDocument();
    expect(result.editor.replaceSelection('X', [{_: 'messageEntityBold', offset: 0, length: 1}])).toBe(true);
    const after = result.editor.getDocument();
    expect(after.content).toHaveLength(1);
    expect(result.editor.getRichValue(true, false).value).toBe(`ABCDE`.slice(0, offset) + 'X' + 'ABCDE'.slice(offset));
    expect(result.editor.getRichValue(true, false).entities).toContainEqual({_: 'messageEntityBold', offset, length: 1});
    roundTrip(result, before, after);
  });

  test.each([0, 2, 5])('inserts a rich block at paragraph offset %i without empty boundary paragraphs', (offset) => {
    const result = setup([paragraph('ABCDE')]);
    const before = result.editor.getDocument();
    expect(result.editor.replaceDocumentRangeWithRichMessage(offset + 1, offset + 1, {
      _: 'richMessage', pFlags: {}, photos: [], documents: [],
      blocks: [{_: 'pageBlockHeading2', text: {_: 'textPlain', text: 'New'}}]
    })).toBe(true);
    const expected = [
      ...(offset ? [{type: 'paragraph', text: 'ABCDE'.slice(0, offset)}] : []),
      {type: 'heading', text: 'New'},
      ...(offset < 5 ? [{type: 'paragraph', text: 'ABCDE'.slice(offset)}] : [])
    ];
    const after = result.editor.getDocument();
    expect(after.content?.map((node) => ({type: node.type, text: node.content?.map(({text}) => text).join('')}))).toEqual(expected);
    roundTrip(result, before, after);
  });

  test.each([
    {name: 'paragraph', content: [paragraph('Text')]},
    {name: 'code', content: [{type: 'codeBlock', content: [text('code')]}]},
    {name: 'whole list', content: [list('orderedList', [item('orderedList', 'A'), item('orderedList', 'B')])]},
    {name: 'table', content: [table()]}
  ])('capability queries are pure in $name', ({content}) => {
    const {editor, tiptap} = setup(content);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc)));
    const before = tiptap.state;
    for(let repeat = 0; repeat < 3; ++repeat) {
      editor.canUndo();
      editor.canRedo();
      editor.canInsertTable();
      editor.canMergeTableCells();
      editor.canSplitTableCell();
      editor.canGroupSelectedRichMedia();
      tiptap.can().toggleOrderedList();
      tiptap.can().chain().toggleBulletList().undo().run();
    }
    expect(tiptap.state).toBe(before);
    expect(editor.canUndo()).toBe(false);
  });

  test('does not apply marks to code that disallows them', () => {
    const {editor, tiptap} = setup([{type: 'codeBlock', content: [text('Code')]}]);
    editor.restoreSelection({from: 1, to: 5}, false);
    const before = editor.getDocument();
    expect(tiptap.can().setBold()).toBe(false);
    expect(editor.applyMarkup({type: 'bold'})).toBe(false);
    expect(editor.getDocument()).toEqual(before);
  });

  function cells(result: ReturnType<typeof setup>) {
    const found: Array<{position: number, text: string, width: number[]}> = [];
    result.tiptap.state.doc.descendants((node, position) => {
      if(node.type.name === 'tableCell' || node.type.name === 'tableHeader') found.push({position, text: node.textContent, width: node.attrs.colwidth});
    });
    return found;
  }

  test.each([false, true])('copies only a rectangular column selection in document order, backward=%s', (backward) => {
    const result = setup([table()]);
    const positions = cells(result);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(CellSelection.create(
      result.tiptap.state.doc, positions[backward ? 6 : 0].position, positions[backward ? 0 : 6].position
    )));
    const clipboard = result.tiptap.view.serializeForClipboard(result.tiptap.state.selection.content());
    expect(clipboard.text).toBe('A1\nA2\nA3');
    expect(clipboard.text).not.toContain('Metrics');
    expect(clipboard.dom.querySelectorAll('td')).toHaveLength(3);
  });

  test.each(['command', 'Backspace', 'Delete'])('clears every selected table cell via %s and restores all cells through history', (action) => {
    const result = setup([table()]);
    const positions = cells(result);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(CellSelection.create(
      result.tiptap.state.doc, positions[0].position, positions[4].position
    )));
    const before = result.editor.getDocument();
    expect(action === 'command' ? result.tiptap.commands.deleteSelection() : key(result, action)).toBe(true);
    expect(cells(result).map(({text}) => text)).toEqual(['', '', 'C1', '', '', 'C2', 'A3', 'B3', 'C3']);
    roundTrip(result, before, result.editor.getDocument());
  });

  test.each([false, true])('keeps colgroup and cell widths aligned after column mutations, readonly=%s', (readonly) => {
    const result = setup([table()]);
    selectText(result, 'A1');
    result.editor.setEditable(!readonly);
    expect(result.input.querySelectorAll('colgroup > col')).toHaveLength(3);
    const before = result.editor.getDocument();
    expect(result.editor.deleteTableColumn()).toBe(true);
    expect(result.input.querySelectorAll('colgroup > col')).toHaveLength(2);
    expect(cells(result).slice(0, 2).map(({width}) => width)).toEqual([[200], [300]]);
    roundTrip(result, before, result.editor.getDocument());
    expect(result.editor.addTableColumnBefore()).toBe(true);
    expect(result.input.querySelectorAll('colgroup > col')).toHaveLength(3);
  });

  test('keeps separate editor states and commands alive after another editor is destroyed', () => {
    const first = setup([paragraph('Alpha')]);
    const second = setup([paragraph('Beta')]);
    first.editor.restoreSelection({from: 1, to: 6}, false);
    second.editor.restoreSelection({from: 3, to: 3}, false);
    expect(first.editor.applyMarkup({type: 'bold'})).toBe(true);
    expect(second.editor.replaceSelection('X')).toBe(true);
    const secondState = second.editor.getDocument();
    expect(second.tiptap.state.doc.textContent).toBe('BeXta');
    expect(first.editor.undo()).toBe(true);
    expect(second.editor.getDocument()).toEqual(secondState);
    first.editor.destroy();
    second.editor.separateHistory();
    expect(second.editor.replaceSelection('Y')).toBe(true);
    expect(second.tiptap.state.doc.textContent).toBe('BeXYta');
    expect(second.editor.undo()).toBe(true);
    expect(second.editor.getDocument()).toEqual(secondState);
  });

  test.each(listTypes)('list conversion does not discard a selected media block for %s', (type) => {
    const result = setup([
      paragraph('Before'),
      {type: 'richMedia', attrs: {block: {_: 'pageBlockPhoto', pFlags: {}, photo_id: '1', caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}}}},
      paragraph('After')
    ]);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(new AllSelection(result.tiptap.state.doc)));
    const media = result.tiptap.state.doc.child(1).toJSON();
    if(type === 'bulletList') result.editor.toggleBulletList();
    else if(type === 'orderedList') result.editor.toggleOrderedList();
    else result.editor.toggleTaskList();
    const found: JSONContent[] = [];
    result.tiptap.state.doc.descendants((node) => {if(node.type.name === 'richMedia') found.push(node.toJSON());});
    expect(found).toEqual([media]);
    expect(result.tiptap.state.doc.textContent).toBe('BeforeAfter');
  });

  test.each([0, 1, 2])('updates only the edited heading placeholder during a background edit at index %i', (index) => {
    const result = setup([1, 2, 3].map((level) => ({type: 'heading', attrs: {level}})));
    const headings = [...result.input.querySelectorAll('h1,h2,h3')];
    const positions: number[] = [];
    result.tiptap.state.doc.descendants((node, position) => {if(node.type.name === 'heading') positions.push(position + 1);});
    result.editor.restoreSelection({from: positions[(index + 1) % 3], to: positions[(index + 1) % 3]}, false);
    expect(headings.every((heading) => heading.classList.contains(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS))).toBe(true);
    const before = result.editor.getDocument();
    result.tiptap.view.dispatch(result.tiptap.state.tr.insertText('Remote', positions[index]));
    expect([...result.input.querySelectorAll('h1,h2,h3')]).toEqual(headings);
    expect(headings.map((heading) => heading.classList.contains(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS)))
    .toEqual([0, 1, 2].map((value) => value !== index));
    roundTrip(result, before, result.editor.getDocument());
  });

  test.each(['before', 'after'])('does not join a differently styled ordered list %s the converted paragraph', (side) => {
    const alpha = {...list('orderedList', [item('orderedList', 'Alpha')]), attrs: {type: 'a'}};
    const decimal = list('orderedList', [item('orderedList', 'Decimal')]);
    const result = setup(side === 'before' ? [alpha, paragraph('Middle'), decimal] : [decimal, paragraph('Middle'), alpha]);
    selectText(result, 'Middle');
    const before = result.editor.getDocument();
    expect(result.editor.toggleOrderedList()).toBe(true);
    const lists = result.editor.getDocument().content!;
    expect(lists).toHaveLength(2);
    const alphaIndex = side === 'before' ? 0 : 1;
    expect(lists[alphaIndex].attrs?.type).toBe('a');
    expect(lists[alphaIndex].content).toHaveLength(1);
    expect(lists[1 - alphaIndex].content).toHaveLength(2);
    expect(result.tiptap.state.doc.textContent).toBe(side === 'before' ? 'AlphaMiddleDecimal' : 'DecimalMiddleAlpha');
    roundTrip(result, before, result.editor.getDocument());
  });

  test.each(['td', 'th'])('imports colgroup widths and honors an explicit %s width', (tag) => {
    const result = setup([paragraph()]);
    expect(result.tiptap.view.pasteHTML(
      `<table><colgroup><col width="100"><col width="200"></colgroup><tbody><tr><${tag} colwidth="300">A</${tag}><${tag}>B</${tag}></tr></tbody></table>`,
      new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent
    )).toBe(true);
    expect(cells(result).map(({width}) => width)).toEqual([[300], [200]]);
    expect(result.input.querySelectorAll('colgroup > col')).toHaveLength(2);
  });

  test('removes obsolete list-item DOM attributes while retaining the checkbox node', () => {
    const entry = item('orderedList', 'Task');
    entry.attrs = {checkbox: true, checked: false, type: 'I', value: 8};
    const result = setup([list('orderedList', [entry])]);
    selectText(result, 'Task');
    const li = result.input.querySelector('li')!;
    const checkbox = li.querySelector('button[role="checkbox"]')!;
    expect(li.getAttribute('value')).toBe('8');
    expect(li.getAttribute('data-list-item-type')).toBe('I');
    expect(li.style.listStyleType).toBe('upper-roman');
    const before = result.editor.getDocument();
    expect(result.tiptap.commands.updateAttributes('listItem', {value: null, type: null, checked: true})).toBe(true);
    expect(li.hasAttribute('value')).toBe(false);
    expect(li.hasAttribute('data-list-item-type')).toBe(false);
    expect(li.style.listStyleType).toBe('');
    expect(result.input.querySelector('li')).toBe(li);
    expect(li.querySelector('button[role="checkbox"]')).toBe(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    roundTrip(result, before, result.editor.getDocument());
  });


  test.each([
    {name: 'selected inline code', code: true, range: true, expected: false},
    {name: 'stored inline code', code: true, range: false, expected: false},
    {name: 'selected plain text', code: false, range: true, expected: true},
    {name: 'stored bold', code: false, range: false, expected: true}
  ])('can(setBold) respects $name without mutating state', ({code, range, expected}) => {
    const result = setup([{type: 'paragraph', content: [text('abcd', [{type: code ? 'code' : 'bold'}])]}]);
    result.editor.restoreSelection({from: 2, to: range ? 4 : 2}, false);
    if(!range) result.tiptap.view.dispatch(result.tiptap.state.tr.setStoredMarks([
      result.tiptap.schema.marks[code ? 'code' : 'bold'].create()
    ]));
    const state = result.tiptap.state;
    expect(result.tiptap.can().setBold()).toBe(expected);
    expect(result.tiptap.can().chain().setBold().run()).toBe(expected);
    expect(result.tiptap.state).toBe(state);
  });

  test.each([false, true])('can(setBold) checks every selected textblock, plain neighbor=%s', (plain) => {
    const result = setup([
      {type: 'codeBlock', content: [text('Code')]},
      plain ? paragraph('Plain') : {type: 'codeBlock', content: [text('More')]}
    ]);
    const end = result.tiptap.state.doc.child(0).nodeSize + result.tiptap.state.doc.child(1).nodeSize - 1;
    result.editor.restoreSelection({from: 1, to: end}, false);
    const state = result.tiptap.state;
    expect(result.tiptap.can().setBold()).toBe(plain);
    expect(result.tiptap.state).toBe(state);
  });

  test('nested can chains never receive a dispatch function', () => {
    const result = setup([paragraph('Text')]);
    const state = result.tiptap.state;
    const dispatches: unknown[] = [];
    expect(result.tiptap.can().chain().command(({chain, dispatch}) => {
      dispatches.push(dispatch);
      return chain().command(({dispatch}) => {dispatches.push(dispatch); return true;}).run();
    }).run()).toBe(true);
    expect(dispatches).toEqual([undefined, undefined]);
    expect(result.tiptap.state).toBe(state);
  });

  test.each([1, 2, 4])('finds a link at its start, interior and end (position %i)', (position) => {
    const result = setup([{type: 'paragraph', content: [text('abc', [{type: 'link', attrs: {href: 'https://a.example'}}])]}]);
    result.editor.restoreSelection({from: position, to: position}, false);
    expect(result.editor.getSelectedLink()).toEqual({from: 1, to: 4, text: 'abc', url: 'https://a.example'});
  });

  test.each([false, true])('finds a fully selected link at a mark boundary, backward=%s', (backward) => {
    const result = setup([{type: 'paragraph', content: [text('prefix '), text('abc', [{type: 'link', attrs: {href: 'https://a.example'}}]), text(' suffix')]}]);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(TextSelection.create(result.tiptap.state.doc, backward ? 11 : 8, backward ? 8 : 11)));
    expect(result.editor.getSelectedLink()).toEqual({from: 8, to: 11, text: 'abc', url: 'https://a.example'});
  });

  test.each(['before', 'after', 'across'])('does not find a link in an unlinked paragraph %s another linked paragraph', (side) => {
    const linked: JSONContent = {type: 'paragraph', content: [text('abc', [{type: 'link', attrs: {href: 'https://a.example'}}])]};
    const result = setup(side === 'before' ? [paragraph('plain'), linked] : [linked, paragraph('plain')]);
    const pos = selectText(result, 'plain');
    if(side === 'across') result.editor.restoreSelection({from: 2, to: pos + 2}, false);
    expect(result.editor.getSelectedLink()).toBeUndefined();
  });

  test.each(listTypes)('Backspace splits a %s around a nonempty middle item', (type) => {
    const result = setup([list(type, [item(type, 'A'), item(type, 'B'), item(type, 'C')])]);
    selectText(result, 'B');
    const before = result.editor.getDocument();
    expect(key(result, 'Backspace')).toBe(true);
    const after = result.editor.getDocument();
    expect(after.content?.map(({type}) => type)).toEqual([type, 'paragraph', type]);
    expect(result.tiptap.state.doc.child(0).textContent).toBe('A');
    expect(result.tiptap.state.doc.child(1).textContent).toBe('B');
    expect(result.tiptap.state.doc.child(2).textContent).toBe('C');
    expect(result.tiptap.state.selection.$from.parent.textContent).toBe('B');
    roundTrip(result, before, after);
  });

  test.each(listTypes)('Delete joins shallow nested %s content without losing leaf siblings', (type) => {
    const result = setup([list(type, [item(type, 'A', [list(type, [item(type, 'B'), item(type, 'C')])]), item(type, 'D')])]);
    selectText(result, 'A', 'end');
    const before = result.editor.getDocument();
    expect(key(result, 'Delete')).toBe(true);
    expect(result.tiptap.state.doc.textContent).toBe('ABCD');
    expect(result.editor.getDocument()).not.toEqual(before);
    expect(result.tiptap.state.selection).toBeInstanceOf(TextSelection);
    roundTrip(result, before, result.editor.getDocument());
  });

  test.each([
    {html: '<p><b>A</b> <i>B</i></p>', value: 'A B', marks: ['bold', 'italic']},
    {html: '<pre><code>A\n\tB</code></pre>', value: 'A\n\tB', marks: []},
    {html: '<p>A<br>B<br/>C</p>', value: 'A\nB\nC', marks: []},
    {html: '<p>A &amp; B &lt; C &gt; D &quot;E&quot;</p>', value: 'A & B < C > D "E"', marks: []},
    {html: '<p>partial', value: 'partial', marks: []},
    {html: '<p><b style="font-weight: normal">A</b></p>', value: 'A', marks: []},
    {html: '<p><i style="font-style: normal">A</i></p>', value: 'A', marks: []},
    {html: '<p><span style="font-weight: 700">A</span></p>', value: 'A', marks: ['bold']},
    {html: '<p><span style="font-style: italic">A</span></p>', value: 'A', marks: ['italic']},
    {html: '<p><span style="text-decoration: underline">A</span></p>', value: 'A', marks: ['underline']},
    {html: '<p><span style="vertical-align: sub">A</span></p>', value: 'A', marks: ['subscript']},
    {html: '<p><span style="vertical-align: super">A</span></p>', value: 'A', marks: ['superscript']}
  ])('HTML paste preserves semantic text and marks: $html', ({html, value, marks}) => {
    const result = setup([paragraph()]);
    const before = result.editor.getDocument();
    expect(result.tiptap.view.pasteHTML(html, new Event('paste', {cancelable: true}) as ClipboardEvent)).toBe(true);
    expect(result.editor.getRichValue(true, false).value).toBe(value);
    const actual = new Set<string>();
    result.tiptap.state.doc.descendants((node) => {node.marks.forEach((mark) => actual.add(mark.type.name));});
    expect([...actual].sort()).toEqual([...marks].sort());
    roundTrip(result, before, result.editor.getDocument());
  });

  test.each([
    '(216) 555-1234', 'Call me at 555) later', '216) 555-1234',
    '<unknown>do not lose this', 'A &amp; B', '\\*literal\\*',
    '| code |\n| --- |\n| `a || b` |',
    'hello $$$x^2$$$', '$x$ and $$$y$$$', '```js\n<x>\n```',
    '**bold** and _italic_', 'a. alpha\nb. beta'
  ])('Telegram text preserves literal syntax without CommonMark parsing: %s', (value) => {
    const result = setup([paragraph()]);
    result.editor.setTextWithEntities(value);
    expect(result.editor.getRichValue(true, false).value).toBe(value);
    expect(result.editor.getRichValue(true, false).entities).toEqual([]);
    expect(result.editor.getDocument().content?.every((node) => node.type === 'paragraph')).toBe(true);
  });

  test.each([
    '- [ ] parent\n  - [ ] checkbox child\n  - plain child',
    '- [ ] parent\n  - [ ] checkbox child\n  - plain 1\n  - plain 2',
    '- [ ] parent\n  - [ ] level2\n    - [ ] level3\n    - deep plain',
    '- [ ] parent\n  - plain first\n  - [ ] checkbox after',
    '- [ ] parent\n  - [ ] child 1\n  - [x] child 2'
  ])('preserves every nested mixed task/bullet sibling: %s', (value) => {
    const result = setup([paragraph()]);
    result.editor.setTextWithEntities(value);
    expect(result.editor.getRichValue(true, false).value).toBe(value);
    const expectedText = value.split('\n').map((line) => line.replace(/^\s*- (\[[ x]\] )?/, '')).join('');
    expect(result.tiptap.state.doc.textContent).toBe(expectedText);
    expect(() => result.tiptap.state.doc.check()).not.toThrow();
  });

  test.each(['inlineMath', 'blockMath'])('rejects clearing %s to a blank formula without destroying the existing formula', (type) => {
    const node: JSONContent = {type, attrs: {source: 'x^2'}};
    const result = setup(type === 'inlineMath' ? [{type: 'paragraph', content: [node]}] : [node]);
    const pos = type === 'inlineMath' ? 1 : 0;
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(NodeSelection.create(result.tiptap.state.doc, pos)));
    const before = result.editor.getDocument();
    expect(type === 'inlineMath' ? result.editor.insertInlineMath('') : result.editor.insertBlockMath('')).toBe(false);
    expect(result.editor.getDocument()).toEqual(before);
    expect(result.editor.canUndo()).toBe(false);
  });

  test.each([
    {content: [paragraph()], empty: true},
    {content: [paragraph(' \n\t ')], empty: true},
    {content: [{type: 'paragraph', content: [{type: 'hardBreak'}]}], empty: true},
    {content: [{type: 'heading', attrs: {level: 2}}], empty: true},
    {content: [paragraph(' a ')], empty: false},
    {content: [{type: 'blockMath', attrs: {source: 'x'}}], empty: false},
    {content: [{type: 'blockMath', attrs: {source: ' '}}], empty: true}
  ])('isEmpty follows the Telegram send contract for $content', ({content, empty}) => {
    const result = setup(content);
    expect(result.editor.isEmpty()).toBe(empty);
    const before = result.editor.getDocument();
    expect(result.editor.isEmpty()).toBe(empty);
    expect(result.editor.getDocument()).toEqual(before);
  });

  test.each([
    {type: 'doc', content: [{type: 'notInSchema'}]},
    {type: 'doc', content: [{type: 'paragraph', content: [text('bad', [{type: 'notInSchema'}])]}]}
  ])('rejects invalid document content atomically: %s', (invalid) => {
    const result = setup([paragraph('Original')]);
    selectText(result, 'Original', 'end');
    result.editor.replaceSelection('!');
    const before = result.editor.snapshot();
    expect(result.editor.setDocument(invalid)).toBe(false);
    expect(result.editor.snapshot()).toEqual(before);
    expect(result.editor.undo()).toBe(true);
    expect(result.tiptap.state.doc.textContent).toBe('Original');
  });


  test.each([
    'https://example.com', 'http://example.com', '/same-site/index.html', '../relative.html',
    'mailto:info@example.com', 'ftp://info@example.com', 'tel:+1234567890', '?query=1', '#anchor',
    'tg://resolve?domain=telegram', 'tonsite://example.ton'
  ])('retains allowed URL through HTML and JSON import: %s', (url) => {
    for(const input of ['html', 'json']) {
      const result = setup([paragraph()]);
      if(input === 'html') result.tiptap.view.pasteHTML(`<p><a href="${url}">Link</a></p>`, new Event('paste') as ClipboardEvent);
      else result.editor.setDocument({type: 'doc', content: [{type: 'paragraph', content: [text('Link', [{type: 'link', attrs: {href: url}}])]}]});
      expect(result.input.querySelector('a')?.getAttribute('href')).toBe(url);
      expect(result.editor.getDocument().content?.[0].content?.[0].marks).toContainEqual(expect.objectContaining({type: 'link', attrs: expect.objectContaining({href: url})}));
    }
  });

  const scriptUrl = 'javascript:alert(1)';
  test.each([
    scriptUrl, 'jAvAsCrIpT:alert(1)', ...Array.from({length: 32}, (_, i) => String.fromCharCode(i) + scriptUrl),
    ...['\t', '\n', '\r'].flatMap((space) => [`java${space}script:alert(1)`, `javascript${space}:alert(1)`]),
    'unknown:test', 'unknown-protocol://test', 'unknown-protocol:test', 'foo-bar-baz://payload',
    'tg-protocol:start', 'data:text/html,payload', 'vbscript:msgbox(1)'
  ])('never renders a rejected href from HTML or JSON: %j', (url) => {
    for(const input of ['html', 'json']) {
      const result = setup([paragraph()]);
      if(input === 'html') result.tiptap.view.pasteHTML(`<p><a href="${url}">Link</a></p>`, new Event('paste') as ClipboardEvent);
      else result.editor.setDocument({type: 'doc', content: [{type: 'paragraph', content: [text('Link', [{type: 'link', attrs: {href: url}}])]}]});
      expect(result.tiptap.state.doc.textContent).toBe('Link');
      // The HTML parser replaces NUL with U+FFFD, making this a relative URL.
      const replacedNull = input === 'html' && url.startsWith('\0');
      expect([...result.input.querySelectorAll('a')].every((a) => replacedNull ?
        a.getAttribute('href') === '\ufffd' + url.slice(1) : !a.getAttribute('href'))).toBe(true);
      if(input === 'html' && !replacedNull) expect(result.editor.getDocument().content?.[0].content?.[0].marks).toBeUndefined();
    }
  });

  test.each([
    {attr: '', type: null}, {attr: 'type="1"', type: null},
    ...['a', 'A', 'i', 'I'].map((type) => ({attr: `type="${type}"`, type})),
    ...[{css: 'lower-alpha', type: 'a'}, {css: 'upper-alpha', type: 'A'}, {css: 'lower-roman', type: 'i'}, {css: 'upper-roman', type: 'I'}, {css: 'decimal', type: null}]
    .map(({css, type}) => ({attr: `style="list-style-type: ${css}"`, type}))
  ])('ordered list HTML preserves style and start across serialization: $attr', ({attr, type}) => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML(`<ol ${attr} start="3"><li>A</li><li>B</li></ol>`, new Event('paste') as ClipboardEvent);
    const before = result.editor.getDocument();
    expect(before.content?.[0].attrs?.start).toBe(3);
    expect(canonicalOrderedListType(before.content?.[0].attrs?.type)).toBe(type || '1');
    expect(result.input.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(canonicalOrderedListType(result.input.querySelector('ol')?.getAttribute('type'))).toBe(type || '1');
    const second = setup([paragraph()]);
    second.tiptap.view.pasteHTML(result.tiptap.getHTML(), new Event('paste') as ClipboardEvent);
    const restored = second.editor.getDocument().content?.[0];
    expect(restored?.attrs?.start).toBe(3);
    expect(canonicalOrderedListType(restored?.attrs?.type)).toBe(type || '1');
    expect(restored?.content).toEqual(before.content?.[0].content);
    expect(second.tiptap.state.doc.textContent).toBe('AB');
  });

  test.each(['td', 'th'])('imports a multi-column %s width and retains its merged cell geometry', (tag) => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML(`<table><tbody><tr><${tag} colspan="2" colwidth="120,180">Merged</${tag}></tr><tr><td>A</td><td>B</td></tr></tbody></table>`, new Event('paste') as ClipboardEvent);
    expect(cells(result)[0]).toMatchObject({width: [120, 180], text: 'Merged'});
    expect(result.input.querySelector(tag)?.getAttribute('colspan')).toBe('2');
    expect([...result.input.querySelectorAll('col')].map((col) => (col as HTMLElement).style.width)).toEqual(['120px', '180px']);
    expect(() => result.tiptap.state.doc.check()).not.toThrow();
  });

  test.each([{columns: 1, rows: 1}, {columns: 1, rows: 3}, {columns: 3, rows: 1}, {columns: 3, rows: 3}])(
    'creates a $rows by $columns table with and without headers', ({columns, rows}) => {
      for(const withHeaderRow of [false, true]) {
        const result = setup([paragraph()]);
        const before = result.editor.getDocument();
        expect(result.editor.insertTable({columns, rows, withHeaderRow})).toBe(true);
        const html = result.input.querySelector('table')!;
        expect(html.rows).toHaveLength(rows);
        expect([...html.rows].every((row) => row.cells.length === columns)).toBe(true);
        expect(html.rows[0].cells[0].tagName).toBe(withHeaderRow ? 'TH' : 'TD');
        expect(html.querySelectorAll('col')).toHaveLength(columns);
        expect(cells(result).every((cell) => cell.text === '')).toBe(true);
        roundTrip(result, before, result.editor.getDocument());
      }
    }
  );

  test('keeps colgroup widths and table width consistent through merge and split', () => {
    const result = setup([table()]);
    const positions = cells(result);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(CellSelection.create(result.tiptap.state.doc, positions[0].position, positions[1].position)));
    const widths = () => [...result.input.querySelectorAll('col')].map((col) => (col as HTMLElement).style.width);
    expect(widths()).toEqual(['100px', '200px', '300px']);
    const before = result.editor.getDocument();
    expect(result.editor.mergeTableCells()).toBe(true);
    expect(widths()).toEqual(['100px', '200px', '300px']);
    expect(cells(result)[0].width).toEqual([100, 200]);
    roundTrip(result, before, result.editor.getDocument());
    result.editor.separateHistory();
    const merged = result.editor.getDocument();
    expect(result.editor.splitTableCell()).toBe(true);
    expect(widths()).toEqual(['100px', '200px', '300px']);
    expect(cells(result).slice(0, 3).map(({width}) => width)).toEqual([[100], [200], [300]]);
    roundTrip(result, merged, result.editor.getDocument());
  });


  test.each(['s', 'del', 'strike', 'u'])('imports the semantic %s mark', (tag) => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML(`<p><${tag}>A</${tag}></p>`, new Event('paste') as ClipboardEvent);
    expect(result.editor.getDocument().content?.[0].content).toEqual([text('A', [{type: tag === 'u' ? 'underline' : 'strike'}])]);
  });

  test.each([1, 2, 3, 4, 5, 6])('imports heading level %i from HTML', (level) => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML(`<h${level}>Heading</h${level}>`, new Event('paste') as ClipboardEvent);
    expect(result.editor.getDocument().content?.[0]).toMatchObject({type: 'heading', attrs: {level}, content: [text('Heading')]});
  });

  test.each([false, true])('imports blockquote HTML with paragraph wrappers=%s', (wrapped) => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML(`<blockquote>${wrapped ? '<p>Quote</p>' : 'Quote'}</blockquote>`, new Event('paste') as ClipboardEvent);
    expect(result.editor.getDocument().content?.[0]).toMatchObject({type: 'blockquote', content: [paragraph('Quote'), {type: 'blockquoteCaption'}]});
  });

  test.each([false, true])('can(setBold) distinguishes selected inline code and plain text, mixed=%s', (mixed) => {
    const result = setup([{type: 'paragraph', content: [text('AB', [{type: 'code'}]), text('CD', mixed ? [{type: 'italic'}] : [{type: 'code'}])]}]);
    result.editor.restoreSelection({from: 1, to: 5}, false);
    const state = result.tiptap.state;
    expect(result.tiptap.can().setBold()).toBe(mixed);
    expect(result.tiptap.state).toBe(state);
  });

  test('deleteSelection on a collapsed caret changes neither document nor history', () => {
    const result = setup([paragraph('Text')]);
    result.editor.restoreSelection({from: 2, to: 2}, false);
    const before = result.editor.snapshot();
    expect(result.tiptap.commands.deleteSelection()).toBe(false);
    expect(result.editor.snapshot()).toEqual(before);
    expect(result.editor.canUndo()).toBe(false);
  });

  test.each(listTypes)('can() offers every list toggle on a whole %s document without changing it', (type) => {
    const result = setup([list(type, [item(type, 'A'), item(type, 'B')])]);
    result.tiptap.view.dispatch(result.tiptap.state.tr.setSelection(new AllSelection(result.tiptap.state.doc)));
    const state = result.tiptap.state;
    expect(result.tiptap.can().toggleBulletList()).toBe(true);
    expect(result.tiptap.can().toggleOrderedList()).toBe(true);
    expect(result.tiptap.can().toggleTaskList()).toBe(true);
    expect(result.tiptap.state).toBe(state);
  });

  test('imports task-list HTML checked states and child text', () => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Done</p></li><li data-type="taskItem" data-checked="false"><p>Pending</p></li></ul>', new Event('paste') as ClipboardEvent);
    const root = result.editor.getDocument().content?.[0];
    expect(root?.type).toBe('taskList');
    expect(root?.content?.map((node) => ({checked: node.attrs?.checked, content: node.content}))).toEqual([
      {checked: true, content: [paragraph('Done')]}, {checked: false, content: [paragraph('Pending')]}
    ]);
  });

  test('imports Google Docs list numbering from a styled li child', () => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML('<ol><li style="list-style-type: upper-roman">First</li><li style="list-style-type: upper-roman">Second</li></ol>', new Event('paste') as ClipboardEvent);
    const root = result.editor.getDocument().content?.[0];
    expect(canonicalOrderedListType(root?.attrs?.type)).toBe('I');
    expect(result.tiptap.state.doc.textContent).toBe('FirstSecond');
  });

  test.each([
    {html: '<p>A\n\tB</p>', value: 'A B'},
    {html: '<h1>A</h1>\n\t<p>B</p>', value: 'A\nB'},
    {html: '', value: ''},
    {html: 'A<p', value: 'A'},
    {html: '<ul><li>A</li><li>B</li></ul>', value: '- A\n- B'},
    {html: '<p><span style="text-decoration: line-through">A</span></p>', value: 'A'}
  ])('HTML clipboard has an explicit whitespace/malformed-content contract: $html', ({html, value}) => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML(html, new Event('paste') as ClipboardEvent);
    expect(result.editor.getRichValue(true, false).value).toBe(value);
    expect(() => result.tiptap.state.doc.check()).not.toThrow();
    if(html.includes('line-through')) expect(result.editor.getDocument().content?.[0].content?.[0].marks).toEqual([{type: 'strike'}]);
  });

  test('Details HTML at document start keeps its content and an accessible toggle', () => {
    const result = setup([paragraph()]);
    result.tiptap.view.pasteHTML('<details open><summary>Summary</summary><p>Body</p></details>', new Event('paste') as ClipboardEvent);
    const details = result.editor.getDocument().content?.[0];
    expect(details?.type).toBe('details');
    expect(result.tiptap.state.doc.textContent).toBe('SummaryBody');
    const toggle = result.input.querySelector('.chat-input-details-toggle')!;
    expect(toggle.getAttribute('aria-label')).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  test('empty table min-width follows column insertions and deletions', () => {
    const result = setup([paragraph()]);
    result.editor.insertTable({columns: 3, rows: 1, withHeaderRow: false});
    const html = result.input.querySelector('table')!;
    expect(html.style.minWidth).toBe('192px');
    result.editor.restoreSelection({from: cells(result)[0].position + 2, to: cells(result)[0].position + 2}, false);
    result.editor.addTableColumnAfter();
    expect(html.style.minWidth).toBe('256px');
    result.editor.deleteTableColumn();
    expect(html.style.minWidth).toBe('192px');
  });

  test.each(listTypes)('never decorates %s wrapper nodes as empty text placeholders', (type) => {
    const result = setup([list(type, [item(type, '')])]);
    const wrappers = result.input.querySelectorAll('ul,ol,li');
    expect(wrappers.length).toBeGreaterThan(0);
    expect([...wrappers].every((node) => !node.hasAttribute('data-placeholder'))).toBe(true);
    expect(result.input.querySelector('.chat-input-trailing-placeholder')?.getAttribute('data-placeholder')).toBeTruthy();
  });

  test('keeps heading placeholders correct through rapid edits, deletion, splitting and joining', () => {
    const result = setup([1, 2, 3].map((level) => ({type: 'heading', attrs: {level}})));
    const empty = () => [...result.input.querySelectorAll('h1,h2,h3')].map((node) => node.classList.contains(CHAT_INPUT_PLACEHOLDER_EMPTY_CLASS));
    expect(empty()).toEqual([true, true, true]);
    for(let i = 0; i < 12; ++i) {
      result.tiptap.view.dispatch(result.tiptap.state.tr.insertText('X', 1));
      expect(empty()).toEqual([false, true, true]);
      result.tiptap.view.dispatch(result.tiptap.state.tr.delete(1, 2));
      expect(empty()).toEqual([true, true, true]);
    }
    result.tiptap.view.dispatch(result.tiptap.state.tr.insertText('AB', 1));
    result.tiptap.view.dispatch(result.tiptap.state.tr.split(2));
    expect(empty()).toEqual([false, false, true, true]);
    result.tiptap.view.dispatch(result.tiptap.state.tr.join(3));
    expect(empty()).toEqual([false, true, true]);
    result.editor.restoreSelection({from: 1, to: 3}, false);
    result.tiptap.commands.deleteSelection();
    expect(empty()).toEqual([true, true, true]);
  });


  test.each([false, true])('Backspace inside a quote joins body paragraphs and retains the quote, middle=%s', (middle) => {
    const result = setup([{type: 'blockquote', content: [paragraph('A'), paragraph('B'), ...(middle ? [paragraph('C')] : [])]}]);
    selectText(result, 'B');
    const before = result.editor.getDocument();
    expect(key(result, 'Backspace')).toBe(true);
    const after = result.editor.getDocument();
    expect(after.content?.map(({type}) => type)).toEqual(['blockquote']);
    expect(after.content?.[0].content).toEqual([paragraph('AB'), ...(middle ? [paragraph('C')] : []), {type: 'blockquoteCaption'}]);
    expect(result.tiptap.state.selection.$from.parentOffset).toBe(1);
    roundTrip(result, before, after);
  });

  test('Delete after plain quote body joins the following text without editing its hidden author', () => {
    const result = setup([{type: 'blockquote', content: [paragraph('A')]}, paragraph('B')]);
    selectText(result, 'A', 'end');
    const before = result.editor.getDocument();
    expect(key(result, 'Delete')).toBe(true);
    const after = result.editor.getDocument();
    expect(result.tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(after.content?.[0].content).toEqual([paragraph('A'), paragraph('B'), {type: 'blockquoteCaption'}]);
    expect(result.editor.getMode()).toBe('plain');
    roundTrip(result, before, after);
    expect(key(result, 'Delete')).toBe(true);
    expect(result.editor.getRichValue(true, false).value).toBe('AB');
    roundTrip(result, after, result.editor.getDocument());
  });

  test('two Backspaces after a quote first enter its body then join the last paragraph', () => {
    const result = setup([{type: 'blockquote', content: [paragraph('A'), paragraph('B')]}, paragraph('C')]);
    selectText(result, 'C');
    const before = result.editor.getDocument();
    expect(key(result, 'Backspace')).toBe(true);
    const after = result.editor.getDocument();
    expect(after.content?.map(({type}) => type)).toEqual(['blockquote']);
    expect(after.content?.[0].content).toEqual([paragraph('A'), paragraph('B'), paragraph('C'), {type: 'blockquoteCaption'}]);
    expect(result.tiptap.state.selection.$from.parentOffset).toBe(0);
    roundTrip(result, before, after);
    result.editor.separateHistory();
    expect(key(result, 'Backspace')).toBe(true);
    expect(result.editor.getDocument().content?.[0].content).toEqual([paragraph('A'), paragraph('BC'), {type: 'blockquoteCaption'}]);
    expect(result.tiptap.state.selection.$from.parentOffset).toBe(1);
    roundTrip(result, after, result.editor.getDocument());
  });


  test('placeholder updates reuse unchanged subtrees and selection-only decoration results', () => {
    const result = setup(Array.from({length: 200}, (_, index) => ({type: 'heading', attrs: {level: index % 6 + 1}})));
    const plugin = chatInputPlaceholdersKey.get(result.tiptap.state)!;
    const get = (state: EditorState) => plugin.props.decorations.call(plugin, state);
    const initial = get(result.tiptap.state);
    const selected = EditorState.create({schema: result.tiptap.schema, doc: result.tiptap.state.doc, selection: TextSelection.create(result.tiptap.state.doc, 3)});
    expect(get(selected)).toBe(initial);
    const doc = result.tiptap.state.tr.insertText('X', 1).doc;
    const rootVisit = vi.spyOn(doc, 'descendants');
    const unchangedVisit = vi.spyOn(doc.child(100), 'descendants');
    try {
      const updated = get(EditorState.create({schema: result.tiptap.schema, doc}));
      expect(updated).not.toBe(initial);
      expect(rootVisit).not.toHaveBeenCalled();
      expect(unchangedVisit).not.toHaveBeenCalled();
    } finally {
      rootVisit.mockRestore();
      unchangedVisit.mockRestore();
    }
  });


  test('placeholder cache refreshes after language apply and releases its listener on destroy', () => {
    const result = setup([{type: 'heading', attrs: {level: 1}}]);
    const before = result.input.querySelector('h1')?.getAttribute('data-placeholder');
    const format = vi.spyOn(I18n, 'format').mockReturnValue('Translated placeholder');
    const remove = vi.spyOn(rootScope, 'removeEventListener');
    try {
      rootScope.dispatchEventSingle('language_apply');
      result.tiptap.view.updateState(result.tiptap.state);
      expect(result.input.querySelector('h1')?.getAttribute('data-placeholder')).toBe('Translated placeholder');
      expect(before).not.toBe('Translated placeholder');
      result.editor.destroy();
      expect(remove).toHaveBeenCalledWith('language_apply', expect.any(Function));
    } finally {
      format.mockRestore();
      remove.mockRestore();
    }
  });

  test('cached centered placeholders keep click caret positions after preceding text grows', () => {
    const result = setup([paragraph('Before'), {type: 'pullquote', content: [{type: 'pullquoteText'}]}]);
    const initialLabel = result.input.querySelector<HTMLElement>('.chat-input-context-placeholder-label')!;
    const beforePosition = Number(initialLabel.getAttribute('data-placeholder-position'));
    result.tiptap.view.dispatch(result.tiptap.state.tr.insertText('XXX', 1));
    const label = result.input.querySelector<HTMLElement>('.chat-input-context-placeholder-label')!;
    expect(Number(label.getAttribute('data-placeholder-position'))).toBe(beforePosition + 3);
    label.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, button: 0}));
    expect(result.tiptap.state.selection.from).toBe(beforePosition + 3);
    expect(result.tiptap.state.selection.$from.parent.type.name).toBe('pullquoteText');
    expect(result.tiptap.state.selection.empty).toBe(true);
  });
});

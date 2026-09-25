import {Schema} from '@tiptap/pm/model';
import {history, undo} from '@tiptap/pm/history';
import {EditorState, TextSelection, type Transaction} from '@tiptap/pm/state';
import {deleteEmptyNonTerminalListItem} from '@components/chat/inputEditor/listCommands';

const schema = new Schema({
  nodes: {
    doc: {content: 'block+'},
    paragraph: {content: 'text*', group: 'block'},
    bulletList: {content: 'listItem+', group: 'block'},
    orderedList: {attrs: {start: {default: 1}}, content: 'listItem+', group: 'block'},
    taskList: {content: 'taskItem+', group: 'block'},
    listItem: {content: 'paragraph block*'},
    taskItem: {
      attrs: {checked: {default: false}},
      content: 'paragraph block*'
    },
    text: {}
  }
});

function paragraph(text = '') {
  return schema.node('paragraph', undefined, text ? schema.text(text) : undefined);
}

function stateAtItem(options: {
  index: number,
  itemName?: 'listItem' | 'taskItem',
  listName?: 'bulletList' | 'orderedList' | 'taskList',
  values?: string[]
}) {
  const {
    index,
    itemName = 'listItem',
    listName = 'bulletList',
    values = ['first', '', 'third']
  } = options;
  const items = values.map((value) => schema.node(itemName, undefined, paragraph(value)));
  const list = schema.node(listName, listName === 'orderedList' ? {start: 4} : undefined, items);
  const doc = schema.node('doc', undefined, list);
  let itemPosition = 1;
  for(let current = 0; current < index; ++current) {
    itemPosition += items[current].nodeSize;
  }
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, itemPosition + 2)
  });
}

function run(state: EditorState) {
  let nextState = state;
  const handled = deleteEmptyNonTerminalListItem(
    state,
    (transaction: Transaction) => nextState = state.apply(transaction)
  );
  return {handled, state: nextState};
}

describe('list item Backspace', () => {
  test.each([
    ['bulletList', 'listItem'],
    ['orderedList', 'listItem'],
    ['taskList', 'taskItem']
  ] as const)('removes an empty intermediate %s item and moves to the previous item', (
    listName,
    itemName
  ) => {
    const result = run(stateAtItem({index: 1, itemName, listName}));

    expect(result.handled).toBe(true);
    expect(result.state.doc.firstChild?.childCount).toBe(2);
    expect(result.state.doc.firstChild?.child(0).textContent).toBe('first');
    expect(result.state.doc.firstChild?.child(1).textContent).toBe('third');
    expect(result.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(result.state.selection.$from.parent.textContent).toBe('first');
    expect(result.state.selection.$from.parentOffset).toBe(5);
  });

  test('preserves ordered-list attributes', () => {
    const result = run(stateAtItem({index: 1, listName: 'orderedList'}));

    expect(result.state.doc.firstChild?.attrs.start).toBe(4);
  });

  test('restores the removed item and its selection through Undo', () => {
    let state = stateAtItem({index: 1}).reconfigure({plugins: [history()]});
    expect(deleteEmptyNonTerminalListItem(
      state,
      (transaction) => state = state.apply(transaction)
    )).toBe(true);

    expect(state.doc.firstChild?.childCount).toBe(2);
    expect(undo(state, (transaction) => state = state.apply(transaction))).toBe(true);
    expect(state.doc.firstChild?.childCount).toBe(3);
    expect(state.selection.$from.parent.content.size).toBe(0);
    expect(state.selection.$from.parentOffset).toBe(0);
  });

  test('leaves the terminal empty item to the standard list-exit behavior', () => {
    const result = run(stateAtItem({
      index: 2,
      values: ['first', 'second', '']
    }));

    expect(result.handled).toBe(false);
    expect(result.state.doc.firstChild?.childCount).toBe(3);
  });

  test('does not consume a non-empty item or the first item', () => {
    expect(run(stateAtItem({index: 1, values: ['first', 'second', 'third']})).handled).toBe(false);
    expect(run(stateAtItem({index: 0, values: ['', 'second', 'third']})).handled).toBe(false);
  });

  test('works at the current nesting level', () => {
    const nestedItems = ['parent', '', 'nested third'].map((value) => (
      schema.node('listItem', undefined, paragraph(value))
    ));
    const nestedList = schema.node('bulletList', undefined, nestedItems);
    const outerItem = schema.node('listItem', undefined, [paragraph('outer'), nestedList]);
    const list = schema.node('bulletList', undefined, [outerItem]);
    const doc = schema.node('doc', undefined, list);
    const nestedListPosition = 1 + 1 + paragraph('outer').nodeSize;
    const middleItemPosition = nestedListPosition + 1 + nestedItems[0].nodeSize;
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, middleItemPosition + 2)
    });
    const result = run(state);

    expect(result.handled).toBe(true);
    expect(result.state.doc.textContent).toBe('outerparentnested third');
    expect(result.state.selection.$from.parent.textContent).toBe('parent');
    expect(result.state.selection.$from.parentOffset).toBe(6);
  });
});

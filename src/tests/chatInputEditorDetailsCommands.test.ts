import {Schema} from '@tiptap/pm/model';
import {EditorState, TextSelection, type Transaction} from '@tiptap/pm/state';
import unwrapDetailsOnEmptySummaryBackspace, {
  handleDetailsBackspace,
  moveDetailsBodyStartToSummary
} from '@components/chat/inputEditor/detailsCommands';

const schema = new Schema({
  nodes: {
    doc: {content: 'block+'},
    details: {content: 'detailsSummary detailsBody', group: 'block'},
    detailsSummary: {content: 'inline*'},
    detailsBody: {content: 'block+'},
    paragraph: {content: 'text*', group: 'block'},
    text: {group: 'inline'}
  }
});

function detailsState({
  body = '',
  selection = 'summary',
  title = '',
  trailing = true
}: {
  body?: string,
  selection?: 'body' | 'summary',
  title?: string,
  trailing?: boolean
} = {}) {
  const paragraph = schema.node('paragraph', null, body ? schema.text(body) : undefined);
  const details = schema.node('details', null, [
    schema.node('detailsSummary', null, title ? schema.text(title) : undefined),
    schema.node('detailsBody', null, paragraph)
  ]);
  const doc = schema.node('doc', null, [
    details,
    ...(trailing ? [schema.node('paragraph')] : [])
  ]);
  let bodyPosition = -1;
  let summaryPosition = -1;
  doc.descendants((node, position) => {
    if(node.type.name === 'detailsSummary') {
      summaryPosition = position + 1;
      return false;
    }
    if(node.type.name === 'paragraph' && bodyPosition === -1) {
      bodyPosition = position + 1;
      return false;
    }
  });
  return EditorState.create({
    doc,
    selection: TextSelection.create(
      doc,
      selection === 'body' ? bodyPosition : summaryPosition
    )
  });
}

function run(
  state: EditorState,
  command = unwrapDetailsOnEmptySummaryBackspace
) {
  let nextState = state;
  const handled = command(state, (transaction: Transaction) => {
    nextState = state.apply(transaction);
  });
  return {handled, state: nextState};
}

describe('Details Backspace command', () => {
  test('turns an entirely empty Details into the existing trailing paragraph', () => {
    const result = run(detailsState());

    expect(result.handled).toBe(true);
    expect(result.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [{type: 'paragraph'}]
    });
    expect(result.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  test('leaves one empty paragraph when there is no trailing placeholder', () => {
    const result = run(detailsState({trailing: false}));

    expect(result.handled).toBe(true);
    expect(result.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [{type: 'paragraph'}]
    });
  });

  test('unwraps a body with content instead of deleting it', () => {
    const result = run(detailsState({body: 'Body'}));

    expect(result.handled).toBe(true);
    expect(result.state.doc.textContent).toBe('Body');
    expect(result.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(result.state.selection.$from.parent.textContent).toBe('Body');
  });

  test('lets the normal Backspace command delete title text first', () => {
    const result = run(detailsState({title: 'Title'}));

    expect(result.handled).toBe(false);
    expect(result.state.doc.textContent).toBe('Title');
  });

  test('moves from the start of the body to the end of the title', () => {
    const initial = detailsState({body: 'Body', selection: 'body', title: 'Title'});
    const result = run(initial, moveDetailsBodyStartToSummary);

    expect(result.handled).toBe(true);
    expect(result.state.doc).toBe(initial.doc);
    expect(result.state.selection.$from.parent.type.name).toBe('detailsSummary');
    expect(result.state.selection.$from.parentOffset).toBe('Title'.length);
  });

  test('moves an empty body caret into an empty title before unwrapping Details', () => {
    const moved = run(
      detailsState({selection: 'body'}),
      handleDetailsBackspace
    );

    expect(moved.handled).toBe(true);
    expect(moved.state.selection.$from.parent.type.name).toBe('detailsSummary');

    const unwrapped = run(moved.state, handleDetailsBackspace);
    expect(unwrapped.handled).toBe(true);
    expect(unwrapped.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [{type: 'paragraph'}]
    });
  });

  test('keeps normal Backspace behavior away from the start of the body', () => {
    const initial = detailsState({body: 'Body', selection: 'body'});
    const state = initial.apply(
      initial.tr.setSelection(TextSelection.create(initial.doc, initial.selection.from + 1))
    );
    const result = run(state, handleDetailsBackspace);

    expect(result.handled).toBe(false);
    expect(result.state).toBe(state);
  });
});

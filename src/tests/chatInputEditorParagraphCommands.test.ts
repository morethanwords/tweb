import {Schema} from '@tiptap/pm/model';
import {history, undo} from '@tiptap/pm/history';
import {EditorState, TextSelection, type Transaction} from '@tiptap/pm/state';
import {restoreTopLevelParagraphBoundaryAsHardBreak} from '@components/chat/inputEditor/paragraphCommands';

const schema = new Schema({
  nodes: {
    doc: {content: 'block+'},
    paragraph: {content: 'inline*', group: 'block'},
    hardBreak: {group: 'inline', inline: true, selectable: false},
    text: {group: 'inline'}
  }
});

function paragraph(value = '') {
  return schema.node('paragraph', undefined, value ? schema.text(value) : undefined);
}

function stateAtParagraph(index: number, content = [paragraph('first'), paragraph(), paragraph()]) {
  const doc = schema.node('doc', undefined, content);
  let position = 0;
  for(let current = 0; current < index; ++current) {
    position += doc.child(current).nodeSize;
  }
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, position + 1)
  });
}

function paragraphStart(doc: EditorState['doc'], index: number) {
  let position = 1;
  for(let current = 0; current < index; ++current) {
    position += doc.child(current).nodeSize;
  }
  return position;
}

function run(state: EditorState) {
  let nextState = state;
  const handled = restoreTopLevelParagraphBoundaryAsHardBreak(
    state,
    (transaction: Transaction) => nextState = state.apply(transaction)
  );
  return {handled, state: nextState};
}

describe('top-level paragraph Backspace', () => {
  test('restores one hard break instead of deleting the whole paragraph boundary', () => {
    const result = run(stateAtParagraph(1));

    expect(result.handled).toBe(true);
    expect(result.state.doc.toJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'first'},
            {type: 'hardBreak'}
          ]
        },
        {type: 'paragraph'}
      ]
    });
    expect(result.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(result.state.selection.$from.parentOffset).toBe(6);
  });

  test('does not consume the technical trailing paragraph', () => {
    const result = run(stateAtParagraph(2));

    expect(result.handled).toBe(false);
  });

  test('does not replace a boundary when the current paragraph has content', () => {
    const result = run(stateAtParagraph(1, [
      paragraph('first'),
      paragraph('second'),
      paragraph()
    ]));

    expect(result.handled).toBe(false);
  });

  test('keeps the boundary restoration separate from preceding typing history', () => {
    let state = EditorState.create({
      doc: schema.node('doc', undefined, [
        paragraph('firs'),
        paragraph(),
        paragraph()
      ]),
      plugins: [history()]
    });
    state = state.apply(state.tr.insertText('t', paragraphStart(state.doc, 0) + 4));
    state = state.apply(state.tr.setSelection(TextSelection.create(
      state.doc,
      paragraphStart(state.doc, 1)
    )));
    restoreTopLevelParagraphBoundaryAsHardBreak(
      state,
      (transaction) => state = state.apply(transaction)
    );

    expect(state.doc.textContent).toBe('first');
    expect(undo(state, (transaction) => state = state.apply(transaction))).toBe(true);
    expect(state.doc.textContent).toBe('first');
    expect(state.doc.childCount).toBe(3);

    expect(undo(state, (transaction) => state = state.apply(transaction))).toBe(true);
    expect(state.doc.textContent).toBe('firs');
  });
});

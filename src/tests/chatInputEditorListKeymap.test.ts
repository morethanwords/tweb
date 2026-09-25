import '@/tests/mocks/chatInputEditorEngineUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';

const paragraph = (text: string) => ({type: 'paragraph', content: [{type: 'text', text}]});
const list = (type: string, values: string[]) => ({
  type,
  content: values.map(value => ({
    type: type === 'taskList' ? 'taskItem' : 'listItem', content: [paragraph(value)]
  }))
});

for(const [previous, next] of [
  ['taskList', 'orderedList'], ['taskList', 'bulletList'],
  ['orderedList', 'taskList'], ['bulletList', 'taskList']
]) test.each(['keydown', 'beforeinput', 'virtual'] as const)(`${previous} → ${next}: %s handles one Backspace once`, (inputKind) => {
  const {editor, input, tiptap} = mountChatInputEditor();
  try {
    editor.setDocument({type: 'doc', content: [list(previous, ['A', 'B']), list(next, ['C', 'D'])]});
    let caret = 0;
    tiptap.state.doc.descendants((node, position) => {
      if(node.isText && node.text === 'C') caret = position;
    });
    editor.restoreSelection({from: caret, to: caret});
    const before = editor.getDocument();
    let changes = 0;
    tiptap.on('transaction', ({transaction}) => {if(transaction.docChanged) ++changes;});
    const backspace = () => {
      if(inputKind === 'virtual') editor.deleteBackward();
      else if(inputKind === 'beforeinput') input.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, inputType: 'deleteContentBackward'
      }));
      else input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Backspace', bubbles: true, cancelable: true}));
    };
    backspace();
    const lifted = editor.getDocument();
    expect(lifted.content?.map(node => node.type)).toEqual([previous, 'paragraph', next]);
    expect(lifted.content?.[0]).toEqual(before.content?.[0]);
    expect(lifted.content?.[1]).toEqual(paragraph('C'));
    expect(changes).toBe(1);
    editor.separateHistory();
    backspace();
    expect(changes).toBe(2);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(lifted);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument()).toEqual(lifted);
  } finally {
    editor.destroy();
    input.remove();
  }
});

import '@/tests/mocks/chatInputEditorEngineUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';

const commands: Array<[string, (editor: ChatInputEditor) => boolean]> = [
  ['heading 1', editor => editor.toggleHeading(1)],
  ['heading 2', editor => editor.toggleHeading(2)],
  ['heading 6', editor => editor.toggleHeading(6)],
  ['footer', editor => editor.insertFooter()],
  ['quote', editor => editor.applyMarkup({type: 'quote'})],
  ['pullquote', editor => editor.insertPullquote()],
  ['details', editor => editor.insertDetails()],
  ['code', editor => editor.insertCodeBlock()],
  ['inline math', editor => editor.insertInlineMath('x^2')],
  ['block math', editor => editor.insertBlockMath('x^2')],
  ['divider', editor => editor.insertDivider()],
  ['table', editor => editor.insertTable()],
  ['map', editor => editor.insertMap({latitude: 0, longitude: 0})],
  ['bullet list', editor => editor.toggleBulletList()],
  ['ordered list', editor => editor.toggleOrderedList()],
  ['task list', editor => editor.toggleTaskList()]
];

for(const authoredBlank of [false, true]) test.each(commands)(
  `Undo %s at the final placeholder restores exactly the original document (authoredBlank=${authoredBlank})`,
  (_name, command) => {
    const {editor, input, tiptap} = mountChatInputEditor();
    try {
      editor.setDocument({type: 'doc', content: [
        {type: 'paragraph', content: [{type: 'text', text: 'Before'}]},
        ...(authoredBlank ? [{type: 'paragraph'}] : [])
      ]});
      editor.setExpanded(true);
      const position = tiptap.state.doc.content.size - tiptap.state.doc.lastChild.nodeSize + 1;
      tiptap.commands.setTextSelection(position);
      const before = tiptap.state.doc.toJSON();
      const beforeValue = editor.getRichValue(true, false);
      expect(command(editor)).toBe(true);
      const after = tiptap.state.doc.toJSON();
      for(let cycle = 0; cycle < 3; ++cycle) {
        expect(editor.undo()).toBe(true);
        expect(tiptap.state.doc.toJSON()).toEqual(before);
        expect(editor.getRichValue(true, false)).toEqual(beforeValue);
        expect(editor.redo()).toBe(true);
        expect(tiptap.state.doc.toJSON()).toEqual(after);
      }
    } finally {
      editor.destroy();
      input.remove();
    }
  }
);

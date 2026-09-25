import {CommandManager, commands, Extension} from '@tiptap/core';
import {ListKeymap, listHelpers} from '@tiptap/extension-list';
import {AllSelection, EditorState, Plugin, TextSelection} from '@tiptap/pm/state';
import {normalizeConvertedListMetadata} from '@components/chat/inputEditor/listCommands';
import {clampSelectionOutsideTrailingPlaceholder, isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';

export const ChatListKeymap = ListKeymap.extend({
  name: 'chatListKeymap',

  addKeyboardShortcuts() {
    // A handler can change which list type surrounds the cursor. Stop once it
    // handles the key so the next type cannot process the same press again.
    const backspace = () => this.options.listTypes.some(({itemName, wrapperNames}) => (
      !!this.editor.schema.nodes[itemName] && listHelpers.handleBackspace(this.editor, itemName, wrapperNames)
    ));
    const deleteForward = () => this.options.listTypes.some(({itemName}) => (
      !!this.editor.schema.nodes[itemName] && listHelpers.handleDelete(this.editor, itemName)
    ));
    return {
      Backspace: backspace,
      'Mod-Backspace': backspace,
      Delete: deleteForward,
      'Mod-Delete': deleteForward
    };
  }
});

export const ChatListBehavior = Extension.create({
  name: 'chatListBehavior',
  // Commands are collected in extension order. Override the core toggleList
  // while leaving the higher-priority keyboard handlers in their existing order.
  priority: 90,

  addCommands() {
    return {
      toggleList: (...args) => (props) => {
        const {tr} = props;
        if(!props.dispatch) {
          // clearNodes skips its transform in a normal can() chain, which makes
          // conversion between listItem and taskItem incorrectly look impossible.
          // Run the same command on an isolated state; CommandManager with a
          // custom state never dispatches to the live editor.
          const state = EditorState.create({
            doc: tr.doc,
            schema: tr.doc.type.schema,
            selection: tr.selection,
            storedMarks: tr.storedMarks
          });
          return new CommandManager({editor: props.editor, state}).commands.toggleList(...args);
        }
        const original = tr.selection;
        clampSelectionOutsideTrailingPlaceholder(tr);
        const handled = props.chain()
        .command((current) => commands.toggleList(...args)(current))
        .run();
        if(handled && props.dispatch) {
          const type = typeof args[0] === 'string' ? args[0] : args[0].name;
          if(type === 'bulletList' || type === 'orderedList' || type === 'taskList') {
            normalizeConvertedListMetadata(tr, type);
          }
          if(original instanceof AllSelection) tr.setSelection(new AllSelection(tr.doc));
        } else if(!handled) {
          tr.setSelection(original.map(tr.doc, tr.mapping));
        }
        return handled;
      }
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      view(view) {
        let editable = view.editable;
        return {
          update(view) {
            if(editable === view.editable) return;
            editable = view.editable;
            view.dom.querySelectorAll<HTMLButtonElement>('.chat-input-checklist-button')
            .forEach((button) => button.disabled = !editable);
          }
        };
      }
    })];
  }
});

import type {Editor} from '@tiptap/core';
import {Plugin, PluginKey} from '@tiptap/pm/state';
import {Decoration, DecorationSet} from '@tiptap/pm/view';

const inlineBotPlaceholderKey = new PluginKey<DecorationSet>('inlineBotPlaceholder');

export default function setInlineBotPlaceholder(editor: Editor, placeholder?: string) {
  if(editor.isDestroyed) return;
  const decorations = inlineBotPlaceholderKey.getState(editor.state);
  if(!placeholder && (!decorations || decorations === DecorationSet.empty)) return;

  // Other fields need no plugin; install it only when a bot supplies a hint.
  if(!decorations) {
    editor.registerPlugin(new Plugin<DecorationSet>({
      key: inlineBotPlaceholderKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (transaction, current) => {
          const placeholder = transaction.getMeta(inlineBotPlaceholderKey) as string | undefined;
          if(placeholder === undefined) {
            return transaction.docChanged ? DecorationSet.empty : current;
          }

          const paragraph = transaction.doc.firstChild;
          if(!placeholder || paragraph?.type.name !== 'paragraph') return DecorationSet.empty;
          return DecorationSet.create(transaction.doc, [Decoration.node(0, paragraph.nodeSize, {
            'class': 'chat-input-inline-placeholder',
            'data-inline-placeholder': placeholder
          })]);
        }
      },
      props: {
        decorations: (state) => inlineBotPlaceholderKey.getState(state)
      }
    }));
  }

  editor.view.dispatch(editor.state.tr.setMeta(inlineBotPlaceholderKey, placeholder || ''));
}

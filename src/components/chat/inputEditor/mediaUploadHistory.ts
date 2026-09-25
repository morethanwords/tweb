import {Extension} from '@tiptap/core';
import {isHistoryTransaction} from '@tiptap/pm/history';
import {Plugin, PluginKey, type Transaction} from '@tiptap/pm/state';
import {
  preserveRichMediaSelection,
  withoutRichMediaUpload
} from '@components/chat/inputEditor/richMedia';

export const RICH_MEDIA_ACTION_SETTLED_META = 'chat-input-rich-media-action-settled';
const settledActionsKey = new PluginKey<ReadonlySet<string>>('chatRichMediaUploadHistory');

export default Extension.create({
  name: 'chatRichMediaUploadHistory',

  addProseMirrorPlugins() {
    return [new Plugin<ReadonlySet<string>>({
      key: settledActionsKey,
      state: {
        init: () => new Set(),
        apply(transaction, settled) {
          const id = transaction.getMeta(RICH_MEDIA_ACTION_SETTLED_META);
          return typeof(id) === 'string' ? new Set([...settled, id]) : settled;
        }
      },
      appendTransaction(transactions, _oldState, state) {
        if(!transactions.some(isHistoryTransaction)) return;
        const settled = settledActionsKey.getState(state);
        if(!settled?.size) return;
        let transaction: Transaction;
        state.doc.descendants((node, position) => {
          if(node.type.name !== 'richMedia' || !node.attrs.uploadAction || !settled.has(node.attrs.uploadId)) return;
          transaction ||= state.tr;
          transaction.setNodeMarkup(position, undefined, withoutRichMediaUpload(node.attrs));
          preserveRichMediaSelection(transaction, state.selection, position, position + node.nodeSize);
          return false;
        });
        return transaction?.setMeta('addToHistory', false);
      }
    })];
  }
});

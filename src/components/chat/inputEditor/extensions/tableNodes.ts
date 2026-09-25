import {Extension, Node, mergeAttributes} from '@tiptap/core';
import {TableCell, TableHeader} from '@tiptap/extension-table';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState} from '@tiptap/pm/state';
import {Plugin, TextSelection} from '@tiptap/pm/state';
import genericTableStyles from '@components/genericTable.module.scss';
import {instantViewStyles} from '@components/instantViewFormatting';
import {richTextPlainText, richTextToTiptapInlineContent} from '@components/chat/inputEditor/richMessage';
import {normalizeExternalChatInputTableSelectAll, progressiveSelectAllInChatInputTable} from '@components/chat/inputEditor/tableCommands';
import {
  CHAT_TABLE_TITLE_DATA_ATTRIBUTE,
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import classNames from '@helpers/string/classNames';
import type {RichText} from '@layer';

function legacyChatTableTitleNode(
  table: ProseMirrorNode,
  titleType: ProseMirrorNode['type']
) {
  const title = typeof(table.attrs.title) === 'string' ? table.attrs.title : '';
  const richTitle = table.attrs.titleRichText as RichText | undefined;
  if(richTitle) {
    try {
      if(!title || richTextPlainText(richTitle) === title) {
        return titleType.schema.nodeFromJSON({
          type: CHAT_TABLE_TITLE_NODE_NAME,
          content: richTextToTiptapInlineContent(richTitle)
        });
      }
    } catch{
      // Fall through to the plain legacy title.
    }
  }

  return titleType.create(null, title ? titleType.schema.text(title) : undefined);
}

function tableWithoutLegacyTitle(table: ProseMirrorNode) {
  return table.type.create({
    ...table.attrs,
    title: '',
    titleRichHTML: null,
    titleRichText: null
  }, table.content, table.marks);
}

export function wrapBareChatInputTables(
  state: EditorState,
  addToHistory = true
) {
  const wrapperType = state.schema.nodes[CHAT_TABLE_WRAPPER_NODE_NAME];
  const titleType = state.schema.nodes[CHAT_TABLE_TITLE_NODE_NAME];
  if(!wrapperType || !titleType) return;

  const bareTables: Array<{node: ProseMirrorNode, position: number}> = [];
  state.doc.descendants((node, position, parent) => {
    if(
      node.type.spec.tableRole === 'table' &&
      parent?.type !== wrapperType
    ) {
      bareTables.push({node, position});
    }
  });
  if(!bareTables.length) return;

  const transaction = state.tr;
  bareTables
  .sort((left, right) => right.position - left.position)
  .forEach(({node, position}) => {
    transaction.replaceWith(
      position,
      position + node.nodeSize,
      wrapperType.create(null, [
        legacyChatTableTitleNode(node, titleType),
        tableWithoutLegacyTitle(node)
      ])
    );
  });
  if(!addToHistory) transaction.setMeta('addToHistory', false);
  return transaction;
}

export const ChatTableTitle = Node.create({
  name: CHAT_TABLE_TITLE_NODE_NAME,
  content: 'inline*',

  parseHTML() {
    return [{tag: `div[${CHAT_TABLE_TITLE_DATA_ATTRIBUTE}]`}];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [CHAT_TABLE_TITLE_DATA_ATTRIBUTE]: '',
        'class': classNames('chat-input-table-title', instantViewStyles.TableName, 'text-bold'),
        'spellcheck': 'true'
      }),
      0
    ];
  },

  addProseMirrorPlugins() {
    const titleType = this.type;
    return [new Plugin({
      props: {
        handleClickOn(view, _position, node, nodePosition, _event, direct) {
          if(!direct || node.type !== titleType || node.content.size) return false;
          view.dispatch(view.state.tr.setSelection(
            TextSelection.create(view.state.doc, nodePosition + 1)
          ));
          view.focus();
          return true;
        }
      }
    })];
  }
});

export const ChatTableWrapper = Node.create({
  name: CHAT_TABLE_WRAPPER_NODE_NAME,
  group: 'block',
  content: `${CHAT_TABLE_TITLE_NODE_NAME} table`,
  isolating: true,

  parseHTML() {
    return [{tag: `div[${CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE}]`}];
  },

  renderHTML({HTMLAttributes}) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        [CHAT_TABLE_WRAPPER_DATA_ATTRIBUTE]: '',
        'class': classNames('chat-input-table-block', instantViewStyles.TableWrapper)
      }),
      0
    ];
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if(!transactions.some((transaction) => transaction.docChanged)) return;
        return wrapBareChatInputTables(newState);
      }
    })];
  }
});

export const ChatTableSelectAll = Extension.create({
  name: 'chatTableSelectAll',
  priority: 1100,

  addKeyboardShortcuts() {
    return {
      'Mod-a': () => progressiveSelectAllInChatInputTable(
        this.editor.state,
        (transaction) => this.editor.view.dispatch(transaction)
      )
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, oldState, newState) {
        if(
          transactions.some((transaction) => transaction.docChanged) ||
          !transactions.some((transaction) => transaction.selectionSet)
        ) return;
        return normalizeExternalChatInputTableSelectAll(oldState, newState);
      }
    })];
  }
});

export const ChatTableCell = TableCell.extend({
  content: 'paragraph+'
}).configure({
  HTMLAttributes: {class: classNames('chat-input-table-cell', genericTableStyles.genericCell)}
});

export const ChatTableHeader = TableHeader.extend({
  content: 'paragraph+'
}).configure({
  HTMLAttributes: {class: classNames('chat-input-table-header', genericTableStyles.genericHeaderCell)}
});

function hasValidTableCellContent(doc: ProseMirrorNode) {
  let valid = true;
  doc.descendants((node) => {
    if(node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return valid;
    valid = node.childCount > 0;
    for(let index = 0; valid && index < node.childCount; ++index) {
      valid = node.child(index).type.name === 'paragraph';
    }
    return false;
  });
  return valid;
}

export const ChatTableContentGuard = Extension.create({
  name: 'chatTableContentGuard',

  addProseMirrorPlugins() {
    return [new Plugin({
      filterTransaction(transaction) {
        return !transaction.docChanged || hasValidTableCellContent(transaction.doc);
      }
    })];
  }
});

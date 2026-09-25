import {joinBackward} from '@tiptap/pm/commands';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {TextSelection} from '@tiptap/pm/state';

export function isListContainerNode(node: ProseMirrorNode | null | undefined) {
  return !!node && (
    node.type.name === 'bulletList' ||
    node.type.name === 'orderedList' ||
    node.type.name === 'taskList'
  );
}

export function isListItemNode(node: ProseMirrorNode | null | undefined) {
  return !!node && (
    node.type.name === 'listItem' ||
    node.type.name === 'taskItem'
  );
}

export function joinListItemParagraphBackward(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;
  const {$from} = selection;
  if($from.depth < 2 || $from.parentOffset !== 0 || !$from.parent.isTextblock) return false;
  const item = $from.node(-1);
  const index = $from.index($from.depth - 1);
  if(!isListItemNode(item) || index === 0 || !item.child(index - 1).isTextblock) return false;

  // A continuation paragraph is inside the current item, so join its text
  // before the list keymap can interpret this as a request to lift the item.
  return joinBackward(state, dispatch);
}

export function deleteEmptyNonTerminalListItem(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;

  const {$from} = selection;
  if(
    !$from.parent.isTextblock ||
    $from.parentOffset !== 0 ||
    $from.parent.content.size
  ) return false;

  let itemDepth = -1;
  for(let depth = $from.depth - 1; depth > 0; --depth) {
    if(!isListItemNode($from.node(depth))) continue;
    itemDepth = depth;
    break;
  }
  if(itemDepth < 1) return false;

  const item = $from.node(itemDepth);
  const listDepth = itemDepth - 1;
  const list = $from.node(listDepth);
  if(
    !isListContainerNode(list) ||
    item.childCount !== 1 ||
    item.firstChild !== $from.parent
  ) return false;

  const itemIndex = $from.index(listDepth);
  if(itemIndex <= 0 || itemIndex >= list.childCount - 1) return false;

  const from = $from.before(itemDepth);
  const transaction = state.tr.delete(from, from + item.nodeSize);
  const cursor = TextSelection.findFrom(transaction.doc.resolve(from), -1, true);
  if(!cursor) return false;

  transaction.setSelection(cursor);
  dispatch?.(transaction.scrollIntoView());
  return true;
}

export function normalizeConvertedListMetadata(
  transaction: Transaction,
  listType: 'bulletList' | 'orderedList' | 'taskList'
) {
  const {$from} = transaction.selection;
  let listDepth = -1;
  for(let depth = $from.depth; depth > 0; --depth) {
    if($from.node(depth).type.name === listType) {
      listDepth = depth;
      break;
    }
  }
  if(listDepth < 0) return true;

  const list = $from.node(listDepth);
  const listPosition = $from.before(listDepth);
  list.descendants((node, position) => {
    if(node.type.name !== 'listItem' && node.type.name !== 'taskItem') return;
    const absolutePosition = listPosition + 1 + position;
    const attrs: Record<string, unknown> = node.type.name === 'taskItem' ? {
      ...node.attrs,
      checked: !!node.attrs.checked
    } : {
      ...node.attrs,
      checkbox: null,
      checked: null,
      num: null,
      type: null,
      value: null
    };
    transaction.setNodeMarkup(absolutePosition, undefined, attrs);
    return false;
  });
  return true;
}

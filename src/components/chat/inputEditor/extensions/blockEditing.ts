import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {Plugin, TextSelection} from '@tiptap/pm/state';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';

export function appendParagraphAfterFinalTopLevelBlock(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  blockName: 'details' | 'pullquote',
  requireEmptyBodyParagraph: boolean
) {
  const {$from, empty} = state.selection;
  const trailing = state.doc.lastChild;
  const trailingPosition = state.doc.content.size - (trailing?.nodeSize || 0);
  if(
    !empty ||
    $from.depth < 2 ||
    !$from.parent.isTextblock ||
    $from.parentOffset !== $from.parent.content.size ||
    $from.node(1).type.name !== blockName ||
    $from.after(1) !== trailingPosition ||
    !isTrailingPlaceholderNode(trailing)
  ) return false;

  for(let depth = $from.depth - 1; depth >= 1; --depth) {
    const node = $from.node(depth);
    const ignoresEmptyPullquoteCaption = (
      blockName === 'pullquote' &&
      depth === 1 &&
      node.lastChild?.type.name === 'pullquoteCaption' &&
      !node.lastChild.content.size &&
      $from.indexAfter(depth) === node.childCount - 1
    );
    if($from.indexAfter(depth) !== node.childCount && !ignoresEmptyPullquoteCaption) return false;
  }

  if(requireEmptyBodyParagraph && (
    $from.parent.type.name !== 'paragraph' ||
    $from.parent.content.size ||
    $from.node($from.depth - 1).type.name !== 'detailsBody'
  )) return false;

  if(dispatch) {
    dispatch(state.tr.setSelection(
      TextSelection.create(state.doc, trailingPosition + 1)
    ).scrollIntoView());
  }
  return true;
}

function richBlockEditingTransaction(state: EditorState) {
  const edits: Array<{
    from: number,
    node?: ProseMirrorNode,
    to?: number
  }> = [];
  const link = state.schema.marks.link;
  const transaction = state.tr;

  state.doc.descendants((node, position) => {
    if(node.type.name === 'blockquote') {
      const caption = node.lastChild?.type.name === 'blockquoteCaption' ?
        node.lastChild :
        undefined;
      const bodyCount = node.childCount - (caption ? 1 : 0);
      let hasContent = false;
      for(let index = 0; index < bodyCount; ++index) {
        const child = node.child(index);
        if(child.content.size || child.isAtom) {
          hasContent = true;
          break;
        }
      }
      if(hasContent && !caption) {
        const newCaption = state.schema.nodes.blockquoteCaption?.create();
        if(newCaption) {
          edits.push({
            from: position + node.nodeSize - 1,
            node: newCaption
          });
        }
      } else if(!hasContent && caption && !caption.content.size) {
        const from = position + node.nodeSize - caption.nodeSize - 1;
        edits.push({
          from,
          to: from + caption.nodeSize
        });
      }
    } else if(node.type.name === 'pullquote') {
      const caption = node.lastChild?.type.name === 'pullquoteCaption' ?
        node.lastChild :
        undefined;
      const hasText = !!node.firstChild?.content.size;
      if(hasText && !caption) {
        const newCaption = state.schema.nodes.pullquoteCaption?.create();
        if(newCaption) {
          edits.push({
            from: position + node.nodeSize - 1,
            node: newCaption
          });
        }
      } else if(!hasText && caption && !caption.content.size) {
        const from = position + node.nodeSize - caption.nodeSize - 1;
        edits.push({
          from,
          to: from + caption.nodeSize
        });
      }
    }

    if(node.type.name !== 'detailsSummary' || !link) return;
    node.descendants((child, offset) => {
      if(!child.marks.some((mark) => mark.type === link)) return;
      const from = position + 1 + offset;
      transaction.removeMark(from, from + child.nodeSize, link);
    });
  });

  edits
  .sort((left, right) => right.from - left.from)
  .forEach(({from, node, to}) => {
    if(node) transaction.insert(from, node);
    else transaction.delete(from, to);
  });
  return transaction.docChanged ? transaction : undefined;
}

export const ChatRichBlockEditing = Extension.create({
  name: 'chatRichBlockEditing',

  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if(!transactions.some((transaction) => transaction.docChanged)) return;
        return richBlockEditingTransaction(newState);
      }
    })];
  }
});

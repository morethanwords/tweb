import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {TextSelection} from '@tiptap/pm/state';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';

export function joinParagraphAtPlainQuoteBoundary(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void,
  direction: -1 | 1 = -1
) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;
  const {$from} = selection;
  if($from.parent.type.name !== 'paragraph') return false;
  let from: number;
  let quote: ProseMirrorNode;
  let paragraph: ProseMirrorNode;
  if(direction < 0) {
    if($from.parentOffset !== 0) return false;
    from = $from.before();
    quote = state.doc.resolve(from).nodeBefore;
    paragraph = $from.parent;
  } else {
    if($from.depth < 2 || $from.parentOffset !== $from.parent.content.size) return false;
    quote = $from.node(-1);
    if(quote.type.name !== 'blockquote' || $from.index($from.depth - 1) !== quote.childCount - 2) return false;
    from = $from.after($from.depth - 1);
    paragraph = state.doc.resolve(from).nodeAfter;
    if(paragraph?.type.name !== 'paragraph') return false;
  }
  const caption = quote?.lastChild;
  if(quote?.type.name !== 'blockquote' || quote.attrs.rich ||
    caption?.type.name !== 'blockquoteCaption' || caption.content.size) return false;
  if(isTrailingPlaceholderNode(paragraph)) return true;
  const target = from - caption.nodeSize - 1;
  const transaction = state.tr.delete(from, from + paragraph.nodeSize).insert(target, paragraph);
  const caret = direction < 0 ? target + 1 : $from.pos;
  dispatch?.(transaction.setSelection(TextSelection.create(transaction.doc, caret)).scrollIntoView());
  return true;
}

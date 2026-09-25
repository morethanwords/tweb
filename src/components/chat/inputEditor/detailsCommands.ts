import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {TextSelection} from '@tiptap/pm/state';

function isEmptyParagraph(node?: ProseMirrorNode | null) {
  return !!node && node.type.name === 'paragraph' && !node.content.size;
}

export default function unwrapDetailsOnEmptySummaryBackspace(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;

  const {$from} = selection;
  if(
    $from.parent.type.name !== 'detailsSummary' ||
    $from.parentOffset !== 0 ||
    $from.parent.content.size
  ) return false;

  const detailsDepth = $from.depth - 1;
  if(detailsDepth < 1) return false;
  const details = $from.node(detailsDepth);
  if(details.type.name !== 'details' || details.childCount !== 2) return false;
  const body = details.child(1);
  if(body.type.name !== 'detailsBody' || !body.childCount) return false;

  const from = $from.before(detailsDepth);
  const to = from + details.nodeSize;
  const bodyIsEmptyParagraph = body.childCount === 1 && isEmptyParagraph(body.firstChild);
  const detailsIndex = detailsDepth === 1 ? $from.index(0) : -1;
  const canReuseTrailingParagraph = (
    bodyIsEmptyParagraph &&
    detailsIndex === state.doc.childCount - 2 &&
    isEmptyParagraph(state.doc.lastChild)
  );
  const transaction = canReuseTrailingParagraph ?
    state.tr.delete(from, to) :
    state.tr.replaceWith(from, to, body.content);
  const cursor = TextSelection.findFrom(
    transaction.doc.resolve(Math.min(from, transaction.doc.content.size)),
    1,
    true
  );
  if(!cursor) return false;
  transaction.setSelection(cursor);
  dispatch?.(transaction.scrollIntoView());
  return true;
}

export function moveDetailsBodyStartToSummary(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  const {selection} = state;
  if(!(selection instanceof TextSelection) || !selection.empty) return false;

  const {$from} = selection;
  if(!$from.parent.isTextblock || $from.parentOffset !== 0) return false;

  let bodyDepth = -1;
  for(let depth = $from.depth - 1; depth > 0; --depth) {
    if($from.node(depth).type.name !== 'detailsBody') continue;
    bodyDepth = depth;
    break;
  }
  if(bodyDepth < 1) return false;

  // Backspace should only leave the body from its first editable position.
  // Inside later paragraphs or list items the regular join behavior still applies.
  for(let depth = $from.depth - 1; depth >= bodyDepth; --depth) {
    if($from.index(depth) !== 0) return false;
  }

  const detailsDepth = bodyDepth - 1;
  const details = $from.node(detailsDepth);
  const summary = details.firstChild;
  if(
    details.type.name !== 'details' ||
    summary?.type.name !== 'detailsSummary'
  ) return false;

  const detailsPosition = $from.before(detailsDepth);
  const summaryEnd = detailsPosition + 2 + summary.content.size;
  const transaction = state.tr.setSelection(
    TextSelection.create(state.doc, summaryEnd)
  );
  dispatch?.(transaction.scrollIntoView());
  return true;
}

export function handleDetailsBackspace(
  state: EditorState,
  dispatch?: (transaction: Transaction) => void
) {
  return unwrapDetailsOnEmptySummaryBackspace(state, dispatch) ||
    moveDetailsBodyStartToSummary(state, dispatch);
}

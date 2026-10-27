import {bulletListInputRegex, orderedListInputRegex} from '@tiptap/extension-list';
import {inputRegex as taskItemInputRegex} from '@tiptap/extension-list/task-item';
import type {EditorView} from '@tiptap/pm/view';

export const HEADING_INPUT_REGEXP = /^(#{1,6})\s$/;
export const QUOTE_INPUT_REGEXP = /^\s*>\s$/;
export const TASK_ITEM_INPUT_REGEXP = new RegExp(taskItemInputRegex.source, 'i');

// The markdown markers that make a block of a paragraph when typed at its start, by the node each
// makes. They are the expressions those nodes' input rules match.
const BLOCK_MARKERS: [node: string, find: RegExp][] = [
  ['heading', HEADING_INPUT_REGEXP],
  ['blockquote', QUOTE_INPUT_REGEXP],
  ['bulletList', bulletListInputRegex],
  ['orderedList', orderedListInputRegex],
  ['taskItem', TASK_ITEM_INPUT_REGEXP]
];

// where a line cannot become a paragraph of its own
const LINE_ONLY_CONTAINERS = new Set(['listItem', 'taskItem', 'tableCell', 'tableHeader']);

/**
 * A new line is a break inside the paragraph, and an input rule sees a marker only at a paragraph's
 * start. A marker typed at the start of a later line first moves that line into a paragraph of its
 * own — the same text, as a paragraph boundary is a line break too — where the rules make the block.
 */
export function startBlockMarkerLine(view: EditorView, from: number, to: number, text: string) {
  const {state} = view;
  const $from = state.doc.resolve(from);
  const paragraph = $from.parent;
  if(from !== to || paragraph.type.name !== 'paragraph') return false;
  for(let depth = $from.depth - 1; depth > 0; --depth) {
    if(LINE_ONLY_CONTAINERS.has($from.node(depth).type.name)) return false;
  }
  // nor in inline code, where the input rules do not run (Tiptap's own test): the line would be
  // split off for no block
  if(($from.nodeBefore || $from.nodeAfter)?.marks.some((mark) => mark.type.spec.code)) return false;

  let breakOffset = -1;
  paragraph.forEach((child, offset) => {
    if(child.type.name === 'hardBreak' && offset < $from.parentOffset) breakOffset = offset;
  });
  if(breakOffset < 0) return false;

  const line = paragraph.textBetween(breakOffset + 1, $from.parentOffset, undefined, '￼') + text;
  if(!BLOCK_MARKERS.some(([node, find]) => state.schema.nodes[node] && find.test(line))) return false;

  const breakPosition = $from.start() + breakOffset;
  const transaction = state.tr.delete(breakPosition, breakPosition + 1).split(breakPosition);
  view.dispatch(transaction);

  const position = transaction.mapping.map(from);
  const insert = () => view.state.tr.insertText(text, position);
  if(!view.someProp('handleTextInput', (handle) => handle(view, position, position, text, insert))) {
    view.dispatch(insert());
  }
  return true;
}

import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode, ResolvedPos} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {AllSelection, NodeSelection, Plugin, Selection, TextSelection} from '@tiptap/pm/state';
import {type EditorView} from '@tiptap/pm/view';
import {CHAT_TABLE_WRAPPER_NODE_NAME} from '@components/chat/inputEditor/tableSchema';

export function selectionIsAtVisualTextblockEdge(
  view: EditorView,
  direction: 'down' | 'up'
) {
  const {selection} = view.state;
  return selection instanceof TextSelection &&
    selection.empty &&
    view.endOfTextblock(direction);
}

export function selectionHasRtlDirection(
  view: EditorView,
  position = view.state.selection.from
) {
  const dom = view.domAtPos(position).node;
  const element = dom.nodeType === globalThis.Node.ELEMENT_NODE ?
    dom as HTMLElement :
    dom.parentElement;
  return !!element && element.ownerDocument.defaultView
  ?.getComputedStyle(element).direction === 'rtl';
}

function topLevelTextblocks(node: ProseMirrorNode, position: number) {
  if(node.isTextblock) return [{node, position}];

  const textblocks: Array<{node: ProseMirrorNode, position: number}> = [];
  node.descendants((child, relativePosition, parent) => {
    if(!child.isTextblock) return;
    if(child.type.name === 'blockquoteCaption' && !parent.attrs.rich && !child.content.size) return false;
    if(
      node.type.name === 'details' &&
      !node.attrs.open &&
      child.type.name !== 'detailsSummary'
    ) return false;
    textblocks.push({node: child, position: position + 1 + relativePosition});
  });
  return textblocks;
}

function selectionIsAtTextblockDirectionalEdge(
  state: EditorState,
  direction: -1 | 1,
  view?: EditorView
) {
  const {selection} = state;
  if(
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    !selection.$from.parent.isTextblock
  ) return false;

  const modelOffset = direction < 0 ? 0 : selection.$from.parent.content.size;
  return selection.$from.parentOffset === modelOffset || !!view &&
    selectionIsAtVisualTextblockEdge(view, direction < 0 ? 'up' : 'down');
}

export function topLevelSelectionBoundary(
  state: EditorState,
  direction: -1 | 1,
  view?: EditorView
) {
  const {selection} = state;
  if(
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    selection.$from.depth < 1
  ) return;

  const index = selection.$from.index(0);
  const node = state.doc.child(index);
  const position = selection.$from.before(1);
  const textblocks = topLevelTextblocks(node, position);
  const textblock = direction < 0 ? textblocks[0] : textblocks[textblocks.length - 1];
  if(
    !textblock ||
    selection.$from.parent !== textblock.node ||
    !selectionIsAtTextblockDirectionalEdge(state, direction, view)
  ) return;

  return {index, node, position};
}

export function moveSelectionWithinTopLevelBlock(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  direction: -1 | 1,
  view?: EditorView
) {
  const {$from, empty} = state.selection;
  if(
    !empty ||
    !$from.parent.isTextblock ||
    $from.depth < 2 ||
    !selectionIsAtTextblockDirectionalEdge(state, direction, view)
  ) return false;

  const topLevel = $from.node(1);
  if(
    topLevel.type.name === CHAT_TABLE_WRAPPER_NODE_NAME ||
    topLevel.type.spec.tableRole === 'table'
  ) return false;
  const topLevelPosition = $from.before(1);
  const textblocks = topLevelTextblocks(topLevel, topLevelPosition);
  const currentPosition = $from.before($from.depth);
  const currentIndex = textblocks.findIndex(({position}) => position === currentPosition);
  const target = textblocks[currentIndex + direction];
  if(currentIndex < 0 || !target) return false;
  const position = target.position + 1 + (direction < 0 ? target.node.content.size : 0);
  if(dispatch) dispatch(state.tr.setSelection(
    TextSelection.create(state.doc, position)
  ).scrollIntoView());
  return true;
}

function isInvisibleRichAnchorNode(node: ProseMirrorNode) {
  return node.type.name === 'richAnchor';
}

function adjacentNavigableTopLevelBlock(
  state: EditorState,
  index: number,
  boundaryPosition: number,
  direction: -1 | 1
) {
  let position = boundaryPosition;
  while(index >= 0 && index < state.doc.childCount) {
    const node = state.doc.child(index);
    const nodePosition = direction > 0 ? position : position - node.nodeSize;
    if(!isInvisibleRichAnchorNode(node)) {
      return {index, node, position: nodePosition};
    }
    position = direction > 0 ? nodePosition + node.nodeSize : nodePosition;
    index += direction;
  }
}

export function adjacentTopLevelTable(
  state: EditorState,
  direction: -1 | 1
) {
  const boundary = topLevelSelectionBoundary(state, direction);
  if(!boundary) return;
  const adjacent = adjacentNavigableTopLevelBlock(
    state,
    boundary.index + direction,
    direction > 0 ? boundary.position + boundary.node.nodeSize : boundary.position,
    direction
  );
  if(!adjacent) return;
  const {node: candidate, position: candidatePosition} = adjacent;
  const table = candidate.type.name === CHAT_TABLE_WRAPPER_NODE_NAME ?
    candidate.lastChild :
    candidate;
  if(table?.type.spec.tableRole !== 'table') return;
  const tablePosition = candidate.type.name === CHAT_TABLE_WRAPPER_NODE_NAME ?
    candidatePosition + 1 + candidate.firstChild!.nodeSize :
    candidatePosition;
  return {table, tablePosition};
}

function selectionAtTopLevelBlockEdge(
  state: EditorState,
  node: ProseMirrorNode,
  position: number,
  direction: -1 | 1
) {
  if(node.type.name === 'details' && !node.attrs.open) {
    const summary = node.firstChild;
    if(!summary) return;
    return TextSelection.create(
      state.doc,
      position + 2 + (direction > 0 ? 0 : summary.content.size)
    );
  }

  const textblocks = topLevelTextblocks(node, position);
  const edge = direction > 0 ? textblocks[0] : textblocks[textblocks.length - 1];
  const selection = edge && TextSelection.create(state.doc, edge.position + 1 + (direction < 0 ? edge.node.content.size : 0));
  if(
    selection &&
    selection.from > position &&
    selection.to < position + node.nodeSize
  ) return selection;
  if(NodeSelection.isSelectable(node)) return NodeSelection.create(state.doc, position);
}

export function moveSelectionIntoAdjacentTopLevelBlock(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  direction: -1 | 1,
  view?: EditorView
) {
  const boundary = topLevelSelectionBoundary(state, direction, view);
  if(!boundary) return false;
  const adjacent = adjacentNavigableTopLevelBlock(
    state,
    boundary.index + direction,
    direction > 0 ? boundary.position + boundary.node.nodeSize : boundary.position,
    direction
  );
  if(!adjacent) return false;
  const {node, position} = adjacent;
  const selection = selectionAtTopLevelBlockEdge(state, node, position, direction);
  if(!selection) return false;
  if(dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
  return true;
}

export function moveSelectionFromTopLevelNode(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  direction: -1 | 1
) {
  const {selection} = state;
  if(!(selection instanceof NodeSelection) || selection.$from.depth !== 0) return false;
  const adjacent = adjacentNavigableTopLevelBlock(
    state,
    selection.$from.index(0) + direction,
    direction > 0 ? selection.to : selection.from,
    direction
  );
  if(!adjacent) return false;
  const {node, position} = adjacent;
  const nextSelection = selectionAtTopLevelBlockEdge(state, node, position, direction);
  if(!nextSelection) return false;
  if(dispatch) dispatch(state.tr.setSelection(nextSelection).scrollIntoView());
  return true;
}

export const ChatInlineAtomNavigation = Extension.create({
  name: 'chatInlineAtomNavigation',
  priority: 1150,

  addKeyboardShortcuts() {
    const adjacentPosition = (
      $position: ResolvedPos,
      direction: -1 | 1
    ) => {
      const atom = direction < 0 ? $position.nodeBefore : $position.nodeAfter;
      if(
        !atom?.isInline ||
        !atom.isAtom ||
        atom.type === $position.doc.type.schema.nodes.hardBreak
      ) return;

      let size = atom.nodeSize;
      if(atom.isText) {
        if($position.textOffset) return;
        const segments = [...new Intl.Segmenter(undefined, {
          granularity: 'grapheme'
        }).segment(atom.text || '')];
        const segment = direction < 0 ? segments[segments.length - 1] : segments[0];
        if(!segment) return;
        size = segment.segment.length;
      }

      return $position.pos + direction * size;
    };

    const move = (visualDirection: 'left' | 'right') => {
      const {state, view} = this.editor;
      const {selection} = state;
      if(!(selection instanceof TextSelection) || !selection.empty) return false;
      const direction = selectionHasRtlDirection(view) === (visualDirection === 'left') ? 1 : -1;
      const position = adjacentPosition(selection.$from, direction);
      if(position === undefined) return false;
      view.dispatch(state.tr.setSelection(
        TextSelection.create(state.doc, position)
      ).scrollIntoView());
      return true;
    };

    const extend = (visualDirection: 'left' | 'right') => {
      const {state, view} = this.editor;
      const {selection} = state;
      if(!(selection instanceof TextSelection) || selection.empty) return false;
      const direction = selectionHasRtlDirection(view, selection.head) ===
        (visualDirection === 'left') ? 1 : -1;
      const position = adjacentPosition(selection.$head, direction);
      if(position === undefined) return false;
      view.dispatch(state.tr.setSelection(
        TextSelection.create(state.doc, selection.anchor, position)
      ).scrollIntoView());
      return true;
    };

    return {
      ArrowLeft: () => move('left'),
      ArrowRight: () => move('right'),
      'Shift-ArrowLeft': () => extend('left'),
      'Shift-ArrowRight': () => extend('right')
    };
  }
});

export const ChatEmptyDocumentSelection = Extension.create({
  name: 'chatEmptyDocumentSelection',

  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        const {doc, schema, selection} = newState;
        const child = doc.firstChild;
        const isEmptyDocument =
          doc.childCount === 1 &&
          child?.type === schema.nodes.paragraph &&
          child.content.size === 0;
        if(
          !transactions.some((transaction) => transaction.docChanged) ||
          !(selection instanceof AllSelection) ||
          !isEmptyDocument
        ) return;

        return newState.tr
        .setSelection(Selection.atStart(doc))
        .setMeta('addToHistory', false);
      }
    })];
  }
});

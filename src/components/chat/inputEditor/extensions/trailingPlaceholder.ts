import {Extension} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState, Transaction} from '@tiptap/pm/state';
import {NodeSelection, Plugin, PluginKey, TextSelection} from '@tiptap/pm/state';
import {closeHistory, isHistoryTransaction} from '@tiptap/pm/history';
import {type EditorView} from '@tiptap/pm/view';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';
import {
  topLevelSelectionBoundary,
  selectionHasRtlDirection,
  moveSelectionFromTopLevelNode,
  moveSelectionWithinTopLevelBlock,
  moveSelectionIntoAdjacentTopLevelBlock
} from '@components/chat/inputEditor/extensions/navigation';
import {tableCellContext, tableHasRtlDirection} from '@components/chat/inputEditor/extensions/tableNavigation';

type ChatTrailingPlaceholderPluginState = {
  promotedPositions: number[]
};

const chatTrailingPlaceholderPluginKey =
  new PluginKey<ChatTrailingPlaceholderPluginState>('chatTrailingPlaceholder');

function trailingPlaceholderTransaction(state: EditorState, addToHistory = false) {
  if(isTrailingPlaceholderNode(state.doc.lastChild)) return;
  const paragraph = state.schema.nodes.paragraph?.createAndFill();
  if(!paragraph) return;
  return state.tr
  .insert(state.doc.content.size, paragraph)
  .setMeta('addToHistory', addToHistory);
}

function trailingPlaceholderPosition(doc: ProseMirrorNode) {
  const trailing = doc.lastChild;
  return isTrailingPlaceholderNode(trailing) ?
    doc.content.size - trailing.nodeSize :
    undefined;
}

function normalizePromotedTrailingPlaceholder(
  oldState: EditorState,
  state: EditorState
) {
  const trailingPosition = trailingPlaceholderPosition(state.doc);
  const pluginState = chatTrailingPlaceholderPluginKey.getState(state);
  if(
    trailingPosition === undefined ||
    state.doc.childCount < 2 ||
    !pluginState?.promotedPositions.length
  ) return;

  const previous = state.doc.child(state.doc.childCount - 2);
  const previousPosition = trailingPosition - previous.nodeSize;
  const oldPrevious = oldState.doc.nodeAt(previousPosition);
  if(
    !isTrailingPlaceholderNode(previous) ||
    !pluginState.promotedPositions.includes(previousPosition) ||
    oldPrevious?.type !== state.schema.nodes.paragraph ||
    !oldPrevious.content.size ||
    oldState.doc.resolve(previousPosition).depth !== 0
  ) return;

  // The preceding paragraph used to be the technical placeholder and became
  // user content. If Undo empties it again, retain that node as the placeholder
  // and remove the newer one. This keeps Redo mapped to the original paragraph.
  return state.tr
  .delete(trailingPosition, trailingPosition + state.doc.lastChild.nodeSize)
  .setMeta('addToHistory', false);
}

function isSelectionInTrailingPlaceholder(state: EditorState) {
  const {$from, empty} = state.selection;
  return (
    empty &&
    $from.depth === 1 &&
    $from.parent === state.doc.lastChild &&
    isTrailingPlaceholderNode($from.parent)
  );
}

function moveSelectionToTrailingPlaceholder(
  state: EditorState,
  dispatch: ((transaction: Transaction) => void) | undefined,
  view?: EditorView
) {
  const trailing = state.doc.lastChild;
  if(!isTrailingPlaceholderNode(trailing) || state.doc.childCount < 2) return false;
  const trailingPosition = state.doc.content.size - trailing.nodeSize;
  const {selection} = state;

  if(selection instanceof NodeSelection) {
    if(selection.to !== trailingPosition) return false;
  } else {
    const boundary = topLevelSelectionBoundary(state, 1, view);
    if(!boundary || boundary.index !== state.doc.childCount - 2) return false;
  }

  if(dispatch) {
    dispatch(state.tr.setSelection(
      TextSelection.create(state.doc, trailingPosition + 1)
    ).scrollIntoView());
  }
  return true;
}

export const ChatTrailingPlaceholder = Extension.create({
  name: 'chatTrailingPlaceholder',
  priority: 1100,

  addKeyboardShortcuts() {
    const dispatch = (transaction: Transaction) => this.editor.view.dispatch(transaction);
    const moveWithInlineArrow = (direction: 'left' | 'right') => {
      const {state, view} = this.editor;
      const context = tableCellContext(state);
      if(context) {
        if(
          tableHasRtlDirection(view, context.tableStart - 1) !==
          (direction === 'left')
        ) return false;
        return moveSelectionToTrailingPlaceholder(state, dispatch);
      }
      const modelDirection = selectionHasRtlDirection(view) === (direction === 'left') ? 1 : -1;
      if(state.selection instanceof NodeSelection) {
        return moveSelectionFromTopLevelNode(state, dispatch, modelDirection);
      }
      if(
        !(state.selection instanceof TextSelection) ||
        !state.selection.empty ||
        !view.endOfTextblock(direction)
      ) return false;
      return moveSelectionWithinTopLevelBlock(state, dispatch, modelDirection) ||
        modelDirection > 0 && moveSelectionToTrailingPlaceholder(state, dispatch) ||
        moveSelectionIntoAdjacentTopLevelBlock(state, dispatch, modelDirection);
    };
    return {
      ArrowUp: () => (
        moveSelectionFromTopLevelNode(this.editor.state, dispatch, -1) ||
        moveSelectionWithinTopLevelBlock(
          this.editor.state,
          dispatch,
          -1,
          this.editor.view
        ) ||
        moveSelectionIntoAdjacentTopLevelBlock(
          this.editor.state,
          dispatch,
          -1,
          this.editor.view
        )
      ),
      ArrowDown: () => (
        moveSelectionFromTopLevelNode(this.editor.state, dispatch, 1) ||
        moveSelectionWithinTopLevelBlock(
          this.editor.state,
          dispatch,
          1,
          this.editor.view
        ) ||
        moveSelectionToTrailingPlaceholder(
          this.editor.state,
          dispatch,
          this.editor.view
        ) ||
        moveSelectionIntoAdjacentTopLevelBlock(
          this.editor.state,
          dispatch,
          1,
          this.editor.view
        )
      ),
      ArrowLeft: () => moveWithInlineArrow('left'),
      ArrowRight: () => moveWithInlineArrow('right'),
      Enter: () => {
        const {state} = this.editor;
        if(!isSelectionInTrailingPlaceholder(state) || state.doc.childCount < 2) return false;

        // Promoting the placeholder already adds a paragraph separator.
        // Split it without a hard break so one Enter adds only one newline.
        dispatch(closeHistory(state.tr).split(state.selection.from).scrollIntoView());
        return true;
      },
      Backspace: () => {
        const {state} = this.editor;
        if(!isSelectionInTrailingPlaceholder(state) || state.doc.childCount < 2) return false;
        const {$from} = state.selection;
        const placeholderPosition = $from.before(1);
        const previous = state.doc.child(state.doc.childCount - 2);

        if(isTrailingPlaceholderNode(previous)) {
          const from = placeholderPosition - previous.nodeSize;
          const transaction = state.tr.delete(from, placeholderPosition);
          dispatch(transaction.setSelection(TextSelection.create(transaction.doc, from + 1)));
          return true;
        }

        moveSelectionIntoAdjacentTopLevelBlock(
          state,
          dispatch,
          -1,
          this.editor.view
        );
        return true;
      }
    };
  },

  addProseMirrorPlugins() {
    return [new Plugin<ChatTrailingPlaceholderPluginState>({
      key: chatTrailingPlaceholderPluginKey,
      state: {
        init: () => ({promotedPositions: []}),
        apply(transaction, value, oldState, newState) {
          const promotedPositions = value.promotedPositions
          .map((position) => transaction.mapping.mapResult(position, 1))
          .filter((result) => !result.deleted)
          .map((result) => result.pos);
          const oldTrailingPosition = trailingPlaceholderPosition(oldState.doc);

          if(oldTrailingPosition !== undefined && transaction.docChanged) {
            const mapped = transaction.mapping.mapResult(oldTrailingPosition, 1);
            const node = mapped.deleted ? undefined : newState.doc.nodeAt(mapped.pos);
            if(
              node?.type === newState.schema.nodes.paragraph &&
              node.content.size &&
              newState.doc.resolve(mapped.pos).depth === 0
            ) {
              promotedPositions.push(mapped.pos);
            }
          }

          const newTrailingPosition = trailingPlaceholderPosition(newState.doc);
          return {
            promotedPositions: Array.from(new Set(promotedPositions)).filter(
              (position) => (
                position !== newTrailingPosition &&
                newState.doc.nodeAt(position)?.type === newState.schema.nodes.paragraph
              )
            )
          };
        }
      },
      appendTransaction(transactions, oldState, newState) {
        if(!transactions.some((transaction) => transaction.docChanged)) return;
        if(transactions.some(isHistoryTransaction)) {
          const normalized = normalizePromotedTrailingPlaceholder(oldState, newState);
          if(normalized) return normalized;
        }
        // A user operation that consumes the final placeholder must also own
        // its replacement in history. Otherwise Undo restores the original
        // paragraph while leaving this new one behind as an extra blank line.
        const addToHistory = transactions.some(transaction => transaction.docChanged &&
          !isHistoryTransaction(transaction) && transaction.getMeta('addToHistory') !== false);
        return trailingPlaceholderTransaction(newState, addToHistory);
      },
      view(view) {
        let destroyed = false;
        queueMicrotask(() => {
          if(destroyed) return;
          const transaction = trailingPlaceholderTransaction(view.state);
          if(transaction) view.dispatch(transaction);
        });
        return {
          destroy: () => destroyed = true
        };
      }
    })];
  }
});

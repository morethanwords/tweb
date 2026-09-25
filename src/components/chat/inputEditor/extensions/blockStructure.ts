import {Fragment} from '@tiptap/pm/model';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import type {EditorState} from '@tiptap/pm/state';
import {AllSelection, NodeSelection, PluginKey, Selection, TextSelection} from '@tiptap/pm/state';
import {type EditorView} from '@tiptap/pm/view';
import {isListContainerNode, isListItemNode} from '@components/chat/inputEditor/listCommands';
import {effectiveOrderedListItemValue} from '@components/chat/inputEditor/orderedList';
import {isTrailingPlaceholderNode} from '@components/chat/inputEditor/model';

export type ChatBlockReorderPluginState = {
  dropIndex?: number,
  dropParentPosition?: number,
  selectedParentPosition?: number,
  selectedFrom?: number,
  selectedTo?: number,
  selectionAnchor?: number,
  sourceParentPosition?: number,
  sourceFrom?: number,
  sourceTo?: number
};

export type ChatBlockReorderPluginMeta = {
  clearSelection?: boolean,
  dropIndex?: number,
  dropParentPosition?: number,
  reset?: boolean,
  selectedParentPosition?: number,
  selectedFrom?: number,
  selectedTo?: number,
  selectionAnchor?: number,
  sourceParentPosition?: number,
  sourceFrom?: number,
  sourceTo?: number
};

export type ChatBlockRange = {
  from: number,
  parentPosition?: number,
  to: number
};

export const chatBlockReorderPluginKey = new PluginKey<ChatBlockReorderPluginState>(
  'chatBlockReorder'
);

export function topLevelContentCount(doc: ProseMirrorNode) {
  return doc.childCount - (isTrailingPlaceholderNode(doc.lastChild) ? 1 : 0);
}

export function topLevelBoundaryPosition(doc: ProseMirrorNode, index: number) {
  let position = 0;
  for(let current = 0; current < index && current < doc.childCount; ++current) {
    position += doc.child(current).nodeSize;
  }
  return position;
}

function normalizedTopLevelRange(
  from: number,
  to: number,
  childCount: number
) {
  const normalizedFrom = Math.max(0, Math.min(from, childCount));
  const normalizedTo = Math.max(normalizedFrom, Math.min(to, childCount));
  return normalizedFrom < normalizedTo ? {
    from: normalizedFrom,
    to: normalizedTo
  } : undefined;
}

function listContainersMatch(
  source: ProseMirrorNode | null | undefined,
  target: ProseMirrorNode | null | undefined
) {
  return (
    isListContainerNode(source) &&
    isListContainerNode(target) &&
    source.sameMarkup(target)
  );
}

export function isBlockContainerNode(node: ProseMirrorNode | null | undefined) {
  return !!node && (
    node.type.name === 'blockquote' ||
    node.type.name === 'detailsBody' ||
    isListItemNode(node)
  );
}

export function structuralContainerNode(
  doc: ProseMirrorNode,
  parentPosition?: number
) {
  if(parentPosition === undefined) return doc;
  const parent = doc.nodeAt(parentPosition);
  return isListContainerNode(parent) || isBlockContainerNode(parent) ?
    parent :
    undefined;
}

export function structuralContentCount(
  doc: ProseMirrorNode,
  parentPosition?: number
) {
  const parent = structuralContainerNode(doc, parentPosition);
  if(!parent) return 0;
  if(parentPosition === undefined) return topLevelContentCount(doc);
  if(isListContainerNode(parent)) return parent.childCount;
  let count = 0;
  while(
    count < parent.childCount &&
    parent.child(count).type.isInGroup('block')
  ) ++count;
  return count;
}

export function structuralBoundaryPosition(
  doc: ProseMirrorNode,
  parentPosition: number | undefined,
  index: number
) {
  if(parentPosition === undefined) return topLevelBoundaryPosition(doc, index);
  const parent = structuralContainerNode(doc, parentPosition);
  if(!parent) return -1;
  let position = parentPosition + 1;
  for(let current = 0; current < index && current < parent.childCount; ++current) {
    position += parent.child(current).nodeSize;
  }
  return position;
}

export function normalizedStructuralRange(
  doc: ProseMirrorNode,
  parentPosition: number | undefined,
  from: number,
  to: number
): ChatBlockRange | undefined {
  const range = normalizedTopLevelRange(
    from,
    to,
    structuralContentCount(doc, parentPosition)
  );
  return range && {
    ...range,
    parentPosition
  };
}

function structuralChildren(node: ProseMirrorNode) {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  return children;
}

function structuralNodeOwner(
  doc: ProseMirrorNode,
  position: number,
  node: ProseMirrorNode
) {
  const resolved = doc.resolve(position);
  return resolved.nodeAfter === node ? {
    index: resolved.index(),
    node: resolved.parent
  } : undefined;
}

function listNodeFromChildren(
  list: ProseMirrorNode,
  children: ProseMirrorNode[],
  firstSourceIndex = 0,
  explicitSplitStart = false
) {
  const attrs = explicitSplitStart && list.type.name === 'orderedList' ? {
    ...list.attrs,
    start: effectiveOrderedListItemValue(list, firstSourceIndex),
    startExplicit: true
  } : list.attrs;
  return list.type.create(
    attrs,
    Fragment.fromArray(children),
    list.marks
  );
}

function listNodeFromRange(
  list: ProseMirrorNode,
  from: number,
  to: number
) {
  return listNodeFromChildren(
    list,
    structuralChildren(list).slice(from, to)
  );
}

function splitListAroundInsertedBlock(
  target: ProseMirrorNode,
  index: number,
  inserted: ProseMirrorNode
) {
  const children = structuralChildren(target);
  const middleSplit = index > 0 && index < children.length;
  const result: ProseMirrorNode[] = [];
  if(index > 0) {
    result.push(listNodeFromChildren(
      target,
      children.slice(0, index),
      0,
      middleSplit
    ));
  }
  result.push(inserted);
  if(index < children.length) {
    result.push(listNodeFromChildren(
      target,
      children.slice(index),
      index,
      middleSplit
    ));
  }
  return result;
}

function listRangeRemovalIsValid(
  doc: ProseMirrorNode,
  source: ChatBlockRange,
  sourceParent: ProseMirrorNode
) {
  const sourceChildren = structuralChildren(sourceParent);
  sourceChildren.splice(source.from, source.to - source.from);
  if(sourceChildren.length) {
    return sourceParent.type.validContent(Fragment.fromArray(sourceChildren));
  }
  if(source.parentPosition === undefined) return false;
  const owner = structuralNodeOwner(doc, source.parentPosition, sourceParent);
  if(!owner) return false;
  const ownerChildren = structuralChildren(owner.node);
  ownerChildren.splice(owner.index, 1);
  return owner.node.type.validContent(Fragment.fromArray(ownerChildren));
}

export function validStructuralDropTarget(
  doc: ProseMirrorNode,
  source: ChatBlockRange,
  targetParentPosition: number | undefined,
  dropIndex: number
) {
  const sourceParent = structuralContainerNode(doc, source.parentPosition);
  const targetParent = structuralContainerNode(doc, targetParentPosition);
  const sourceCount = structuralContentCount(doc, source.parentPosition);
  const targetCount = structuralContentCount(doc, targetParentPosition);
  if(
    !sourceParent ||
    !targetParent ||
    source.from < 0 ||
    source.from >= source.to ||
    source.to > sourceCount ||
    dropIndex < 0 ||
    dropIndex > targetCount
  ) return false;

  const sourcePosition = structuralBoundaryPosition(
    doc,
    source.parentPosition,
    source.from
  );
  const sourceEnd = structuralBoundaryPosition(
    doc,
    source.parentPosition,
    source.to
  );
  if(
    targetParentPosition !== undefined &&
    targetParentPosition >= sourcePosition &&
    targetParentPosition < sourceEnd
  ) return false;

  if(isListContainerNode(sourceParent)) {
    if(source.parentPosition === targetParentPosition) {
      return dropIndex < source.from || dropIndex > source.to;
    }
    if(!listRangeRemovalIsValid(doc, source, sourceParent)) return false;

    const insertedList = listNodeFromRange(
      sourceParent,
      source.from,
      source.to
    );
    if(isListContainerNode(targetParent)) {
      if(listContainersMatch(sourceParent, targetParent)) {
        const targetChildren = structuralChildren(targetParent);
        targetChildren.splice(
          dropIndex,
          0,
          ...structuralChildren(insertedList)
        );
        return targetParent.type.validContent(
          Fragment.fromArray(targetChildren)
        );
      }

      if(targetParentPosition === undefined) return false;
      const targetOwner = structuralNodeOwner(
        doc,
        targetParentPosition,
        targetParent
      );
      if(!targetOwner) return false;
      const replacement = splitListAroundInsertedBlock(
        targetParent,
        dropIndex,
        insertedList
      );
      const ownerChildren = structuralChildren(targetOwner.node);
      ownerChildren.splice(targetOwner.index, 1, ...replacement);

      if(
        source.from === 0 &&
        source.to === sourceParent.childCount &&
        source.parentPosition !== undefined
      ) {
        const sourceOwner = structuralNodeOwner(
          doc,
          source.parentPosition,
          sourceParent
        );
        if(sourceOwner?.node === targetOwner.node) {
          const sourceIndex = sourceOwner.index > targetOwner.index ?
            sourceOwner.index + replacement.length - 1 :
            sourceOwner.index;
          ownerChildren.splice(sourceIndex, 1);
        }
      }
      return targetOwner.node.type.validContent(
        Fragment.fromArray(ownerChildren)
      );
    }

    const targetChildren = structuralChildren(targetParent);
    let adjustedDropIndex = dropIndex;
    if(
      source.from === 0 &&
      source.to === sourceParent.childCount &&
      source.parentPosition !== undefined
    ) {
      const sourceOwner = structuralNodeOwner(
        doc,
        source.parentPosition,
        sourceParent
      );
      if(sourceOwner?.node === targetParent) {
        if(
          dropIndex === sourceOwner.index ||
          dropIndex === sourceOwner.index + 1
        ) return false;
        targetChildren.splice(sourceOwner.index, 1);
        if(dropIndex > sourceOwner.index) --adjustedDropIndex;
      }
    }
    targetChildren.splice(adjustedDropIndex, 0, insertedList);
    return targetParent.type.validContent(Fragment.fromArray(targetChildren));
  }
  if(isListContainerNode(targetParent)) return false;

  if(
    source.parentPosition === targetParentPosition &&
    dropIndex >= source.from &&
    dropIndex <= source.to
  ) return false;

  const payload = structuralChildren(sourceParent).slice(source.from, source.to);
  if(source.parentPosition === targetParentPosition) {
    const children = structuralChildren(sourceParent);
    children.splice(source.from, source.to - source.from);
    const adjustedDropIndex = dropIndex > source.to ?
      dropIndex - (source.to - source.from) :
      dropIndex;
    children.splice(adjustedDropIndex, 0, ...payload);
    return sourceParent.type.validContent(Fragment.fromArray(children));
  }

  const sourceChildren = structuralChildren(sourceParent);
  sourceChildren.splice(source.from, source.to - source.from);
  if(!sourceParent.type.validContent(Fragment.fromArray(sourceChildren))) {
    return false;
  }
  const targetChildren = structuralChildren(targetParent);
  targetChildren.splice(dropIndex, 0, ...payload);
  return targetParent.type.validContent(Fragment.fromArray(targetChildren));
}

export function moveStructuralRange(
  state: EditorState,
  source: ChatBlockRange,
  dropIndex: number,
  preserveTextSelection: boolean,
  targetParentPosition: number | undefined
) {
  if(!validStructuralDropTarget(
    state.doc,
    source,
    targetParentPosition,
    dropIndex
  )) return;

  const sourceParent = structuralContainerNode(
    state.doc,
    source.parentPosition
  );
  const targetParent = structuralContainerNode(
    state.doc,
    targetParentPosition
  );
  if(!sourceParent || !targetParent) return;
  const sourcePosition = structuralBoundaryPosition(
    state.doc,
    source.parentPosition,
    source.from
  );
  const sourceEnd = structuralBoundaryPosition(
    state.doc,
    source.parentPosition,
    source.to
  );
  if(sourcePosition < 0 || sourceEnd <= sourcePosition) return;
  const sourceContent = state.doc.slice(sourcePosition, sourceEnd).content;
  const removesWholeSourceList = (
    source.parentPosition !== undefined &&
    source.parentPosition !== targetParentPosition &&
    isListContainerNode(sourceParent) &&
    source.from === 0 &&
    source.to === sourceParent.childCount
  );
  const selection = state.selection;
  const relativeTextSelection = preserveTextSelection &&
    selection instanceof TextSelection &&
    selection.from >= sourcePosition &&
    selection.to <= sourceEnd ? {
      anchor: selection.anchor - sourcePosition,
      head: selection.head - sourcePosition
    } : undefined;

  const sourceOwner = removesWholeSourceList ?
    structuralNodeOwner(state.doc, source.parentPosition, sourceParent) :
    undefined;
  const transaction = state.tr.delete(
    removesWholeSourceList ? source.parentPosition : sourcePosition,
    removesWholeSourceList ?
      source.parentPosition + sourceParent.nodeSize :
      sourceEnd
  );
  const rangeSize = source.to - source.from;
  let mappedTargetParentPosition: number | undefined;
  let mappedTargetParent = transaction.doc;
  if(targetParentPosition !== undefined) {
    const mapped = transaction.mapping.mapResult(targetParentPosition, -1);
    const mappedNode = transaction.doc.nodeAt(mapped.pos);
    if(
      mapped.deletedAcross ||
      !mappedNode ||
      mappedNode.type !== targetParent.type
    ) return;
    mappedTargetParentPosition = mapped.pos;
    mappedTargetParent = mappedNode;
  }

  const setMovedSelection = (
    insertionPosition: number,
    allowNodeSelection: boolean
  ) => {
    if(relativeTextSelection) {
      transaction.setSelection(TextSelection.create(
        transaction.doc,
        insertionPosition + relativeTextSelection.anchor,
        insertionPosition + relativeTextSelection.head
      ));
    } else if(
      allowNodeSelection &&
      rangeSize === 1 &&
      NodeSelection.isSelectable(sourceContent.firstChild)
    ) {
      transaction.setSelection(NodeSelection.create(
        transaction.doc,
        insertionPosition
      ));
    } else {
      transaction.setSelection(Selection.near(
        transaction.doc.resolve(insertionPosition + 1)
      ));
    }
  };

  if(isListContainerNode(sourceParent)) {
    const insertedList = listNodeFromRange(
      sourceParent,
      source.from,
      source.to
    );
    if(
      isListContainerNode(targetParent) &&
      !listContainersMatch(sourceParent, targetParent)
    ) {
      if(mappedTargetParentPosition === undefined) return;
      const replacement = splitListAroundInsertedBlock(
        mappedTargetParent,
        dropIndex,
        insertedList
      );
      const insertedListPosition = mappedTargetParentPosition +
        (dropIndex > 0 ? replacement[0].nodeSize : 0);
      transaction.replaceWith(
        mappedTargetParentPosition,
        mappedTargetParentPosition + mappedTargetParent.nodeSize,
        replacement
      );
      setMovedSelection(insertedListPosition + 1, false);
      return {
        parentPosition: insertedListPosition,
        selectedFrom: 0,
        selectedTo: rangeSize,
        transaction: transaction.scrollIntoView()
      };
    }
    if(!isListContainerNode(targetParent)) {
      let adjustedDropIndex = dropIndex;
      if(
        removesWholeSourceList &&
        sourceOwner?.node === targetParent &&
        dropIndex > sourceOwner.index
      ) --adjustedDropIndex;
      const insertionPosition = structuralBoundaryPosition(
        transaction.doc,
        mappedTargetParentPosition,
        adjustedDropIndex
      );
      if(insertionPosition < 0) return;
      transaction.insert(insertionPosition, insertedList);
      setMovedSelection(insertionPosition + 1, false);
      return {
        parentPosition: insertionPosition,
        selectedFrom: 0,
        selectedTo: rangeSize,
        transaction: transaction.scrollIntoView()
      };
    }
  }

  const sameParent = source.parentPosition === targetParentPosition;
  const adjustedDropIndex = sameParent && dropIndex > source.to ?
    dropIndex - rangeSize :
    dropIndex;
  const insertionPosition = structuralBoundaryPosition(
    transaction.doc,
    mappedTargetParentPosition,
    adjustedDropIndex
  );
  if(insertionPosition < 0) return;
  transaction.insert(insertionPosition, sourceContent);
  setMovedSelection(insertionPosition, true);
  return {
    parentPosition: mappedTargetParentPosition,
    selectedFrom: adjustedDropIndex,
    selectedTo: adjustedDropIndex + rangeSize,
    transaction: transaction.scrollIntoView()
  };
}

function selectedTopLevelBlockRange(state: EditorState) {
  const childCount = topLevelContentCount(state.doc);
  if(!childCount) return;
  const {selection} = state;
  if(selection instanceof AllSelection) return {from: 0, to: childCount};
  const from = Math.min(selection.$from.index(0), childCount - 1);
  let to = Math.min(selection.$to.index(0), childCount);
  if(
    selection.empty ||
    to < childCount &&
    selection.to > topLevelBoundaryPosition(state.doc, to)
  ) ++to;
  return normalizedTopLevelRange(from, Math.max(from + 1, to), childCount);
}

function selectedListItemRange(state: EditorState): ChatBlockRange | undefined {
  const {selection} = state;
  for(let fromDepth = selection.$from.depth; fromDepth > 0; --fromDepth) {
    const parent = selection.$from.node(fromDepth);
    if(!isListContainerNode(parent)) continue;
    const parentPosition = selection.$from.before(fromDepth);
    let toDepth = -1;
    for(let depth = selection.$to.depth; depth > 0; --depth) {
      if(
        selection.$to.node(depth) === parent &&
        selection.$to.before(depth) === parentPosition
      ) {
        toDepth = depth;
        break;
      }
    }
    if(toDepth < 0) continue;

    const from = selection.$from.index(fromDepth);
    let to = selection.$to.index(toDepth);
    if(selection.empty) {
      to = from + 1;
    } else if(
      to < parent.childCount &&
      selection.to > structuralBoundaryPosition(state.doc, parentPosition, to)
    ) {
      ++to;
    }
    return normalizedStructuralRange(
      state.doc,
      parentPosition,
      from,
      Math.max(from + 1, to)
    );
  }
}

export function selectedStructuralBlockRange(state: EditorState): ChatBlockRange | undefined {
  return selectedListItemRange(state) || selectedTopLevelBlockRange(state);
}

export function selectedStructuralTopLevelRange(view: EditorView) {
  const pluginState = chatBlockReorderPluginKey.getState(view.state);
  const selected = selectedTopLevelBlockRange(view.state);
  const selectedFrom = pluginState?.selectedParentPosition === undefined ?
    pluginState?.selectedFrom :
    undefined;
  const selectedTo = pluginState?.selectedParentPosition === undefined ?
    pluginState?.selectedTo :
    undefined;
  return normalizedTopLevelRange(
    selectedFrom ?? selected?.from ?? -1,
    selectedTo ?? selected?.to ?? -1,
    topLevelContentCount(view.state.doc)
  );
}

export function moveSelectedStructuralBlock(view: EditorView, direction: -1 | 1) {
  const pluginState = chatBlockReorderPluginKey.getState(view.state);
  const stateSelection = selectedStructuralBlockRange(view.state);
  const source = normalizedStructuralRange(
    view.state.doc,
    pluginState?.selectedFrom === undefined ?
      stateSelection?.parentPosition :
      pluginState.selectedParentPosition,
    pluginState?.selectedFrom ?? stateSelection?.from ?? -1,
    pluginState?.selectedTo ?? stateSelection?.to ?? -1
  );
  if(!source) return false;
  const dropIndex = direction < 0 ? source.from - 1 : source.to + 1;
  const moved = moveStructuralRange(
    view.state,
    source,
    dropIndex,
    true,
    source.parentPosition
  );
  if(!moved) return false;
  view.dispatch(moved.transaction.setMeta(chatBlockReorderPluginKey, {
    reset: true,
    selectedParentPosition: moved.parentPosition,
    selectedFrom: moved.selectedFrom,
    selectedTo: moved.selectedTo,
    selectionAnchor: moved.selectedFrom
  }));
  return true;
}

export function moveSelectedTopLevelBlock(view: EditorView, direction: -1 | 1) {
  const selected = selectedStructuralTopLevelRange(view);
  if(!selected) return false;
  const source: ChatBlockRange = {...selected};
  const dropIndex = direction < 0 ? source.from - 1 : source.to + 1;
  const moved = moveStructuralRange(
    view.state,
    source,
    dropIndex,
    true,
    source.parentPosition
  );
  if(!moved) return false;
  view.dispatch(moved.transaction.setMeta(chatBlockReorderPluginKey, {
    reset: true,
    selectedFrom: moved.selectedFrom,
    selectedTo: moved.selectedTo,
    selectionAnchor: moved.selectedFrom
  }));
  return true;
}

import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {type EditorView} from '@tiptap/pm/view';
import {isListContainerNode, isListItemNode} from '@components/chat/inputEditor/listCommands';
import {
  topLevelContentCount,
  topLevelBoundaryPosition,
  structuralContentCount,
  structuralBoundaryPosition,
  isBlockContainerNode,
  ChatBlockRange,
  structuralContainerNode,
  validStructuralDropTarget
} from '@components/chat/inputEditor/extensions/blockStructure';

type ChatBlockTarget = {
  element: HTMLElement,
  index: number,
  parentPosition?: number
};

type ChatBlockDropTarget = {
  index: number,
  parentPosition?: number
};

function topLevelBlockElement(view: EditorView, index: number) {
  if(index < 0 || index >= topLevelContentCount(view.state.doc)) return;
  const nodeDOM = view.nodeDOM(topLevelBoundaryPosition(view.state.doc, index));
  const appWindow = view.dom.ownerDocument.defaultView;
  return nodeDOM instanceof appWindow.HTMLElement ?
    nodeDOM :
    nodeDOM?.parentElement;
}

function topLevelBlockIndexAtTarget(view: EditorView, target: EventTarget | null) {
  const appWindow = view.dom.ownerDocument.defaultView;
  if(!(target instanceof appWindow.Node)) return -1;
  for(let index = 0; index < topLevelContentCount(view.state.doc); ++index) {
    if(topLevelBlockElement(view, index)?.contains(target)) return index;
  }
  return -1;
}

export function structuralBlockElement(
  view: EditorView,
  parentPosition: number | undefined,
  index: number
) {
  if(parentPosition === undefined) return topLevelBlockElement(view, index);
  if(
    index < 0 ||
    index >= structuralContentCount(view.state.doc, parentPosition)
  ) return;
  const position = structuralBoundaryPosition(view.state.doc, parentPosition, index);
  const nodeDOM = view.nodeDOM(position);
  const appWindow = view.dom.ownerDocument.defaultView;
  return nodeDOM instanceof appWindow.HTMLElement ?
    nodeDOM :
    nodeDOM?.parentElement;
}

function listItemTargetAtTarget(
  view: EditorView,
  target: EventTarget | null,
  requiredParentPosition?: number
) {
  const appWindow = view.dom.ownerDocument.defaultView;
  if(!(target instanceof appWindow.Node)) return;
  let result: ChatBlockTarget | undefined;
  view.state.doc.descendants((node, position, parent, index) => {
    if(!isListItemNode(node) || !isListContainerNode(parent)) return;
    let offset = 0;
    for(let current = 0; current < index; ++current) {
      offset += parent.child(current).nodeSize;
    }
    const parentPosition = position - offset - 1;
    if(
      requiredParentPosition !== undefined &&
      parentPosition !== requiredParentPosition
    ) return;
    const element = structuralBlockElement(view, parentPosition, index);
    if(element?.contains(target)) {
      result = {element, index, parentPosition};
    }
  });
  return result;
}

function blockChildTargetAtTarget(
  view: EditorView,
  target: EventTarget | null,
  requiredParentPosition?: number,
  frame?: {clientX: number, clientY: number, hitSize: number}
) {
  const appWindow = view.dom.ownerDocument.defaultView;
  if(!(target instanceof appWindow.Node)) return;
  let result: ChatBlockTarget | undefined;
  const inspect = (parent: ProseMirrorNode, parentPosition: number) => {
    if(
      !isBlockContainerNode(parent) ||
      requiredParentPosition !== undefined &&
      parentPosition !== requiredParentPosition
    ) return;
    const count = structuralContentCount(view.state.doc, parentPosition);
    for(let index = 0; index < count; ++index) {
      const element = structuralBlockElement(view, parentPosition, index);
      if(!element?.contains(target)) continue;
      if(frame) {
        const bounds = element.getBoundingClientRect();
        if(
          bounds.width <= 0 && bounds.height <= 0 ||
          !pointIsOnBlockFrame(
            element,
            frame.clientX,
            frame.clientY,
            frame.hitSize
          )
        ) continue;
      }
      result = {element, index, parentPosition};
    }
  };

  if(requiredParentPosition !== undefined) {
    const parent = view.state.doc.nodeAt(requiredParentPosition);
    if(parent) inspect(parent, requiredParentPosition);
  } else {
    view.state.doc.descendants((node, position) => inspect(node, position));
  }
  return result;
}

export function structuralBlockTargetAtTarget(
  view: EditorView,
  target: EventTarget | null,
  frame?: {clientX: number, clientY: number, hitSize: number}
): ChatBlockTarget | undefined {
  const nestedBlock = blockChildTargetAtTarget(view, target, undefined, frame);
  if(nestedBlock) return nestedBlock;
  const listItem = listItemTargetAtTarget(view, target);
  if(listItem) return listItem;
  const index = topLevelBlockIndexAtTarget(view, target);
  const element = topLevelBlockElement(view, index);
  return element && {element, index};
}

export function structuralBlockTargetForParent(
  view: EditorView,
  target: EventTarget | null,
  parentPosition?: number
) {
  if(parentPosition !== undefined) {
    const parent = view.state.doc.nodeAt(parentPosition);
    return isListContainerNode(parent) ?
      listItemTargetAtTarget(view, target, parentPosition) :
      blockChildTargetAtTarget(view, target, parentPosition);
  }
  const index = topLevelBlockIndexAtTarget(view, target);
  const element = topLevelBlockElement(view, index);
  return element && {element, index} as ChatBlockTarget;
}

export function pointIsOnBlockFrame(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  hitSize: number
) {
  const bounds = element.getBoundingClientRect();
  if(
    clientX < bounds.left - hitSize ||
    clientX > bounds.right + hitSize ||
    clientY < bounds.top - hitSize ||
    clientY > bounds.bottom + hitSize
  ) return false;

  return (
    Math.abs(clientX - bounds.left) <= hitSize ||
    Math.abs(clientX - bounds.right) <= hitSize ||
    Math.abs(clientY - bounds.top) <= hitSize ||
    Math.abs(clientY - bounds.bottom) <= hitSize
  );
}

export function blockFrameIsVisible(view: EditorView) {
  return !!view.dom.closest('.chat-input.is-message-input-expanded');
}

export function pointerElementAtPoint(
  view: EditorView,
  clientX: number,
  clientY: number,
  fallbackTarget?: EventTarget | null
) {
  const ownerDocument = view.dom.ownerDocument;
  if(typeof(ownerDocument.elementFromPoint) === 'function') {
    return ownerDocument.elementFromPoint(clientX, clientY);
  }
  const appWindow = ownerDocument.defaultView;
  if(!(fallbackTarget instanceof appWindow.Node)) return null;
  return fallbackTarget instanceof appWindow.Element ?
    fallbackTarget :
    fallbackTarget.parentElement;
}

function blockContainerTargetAtTarget(
  view: EditorView,
  target: EventTarget | null
) {
  const appWindow = view.dom.ownerDocument.defaultView;
  if(
    !(target instanceof appWindow.Node) ||
    !view.dom.contains(target)
  ) return;
  let result: {parentPosition?: number} = {};
  view.state.doc.descendants((node, position) => {
    if(!isBlockContainerNode(node)) return;
    const nodeDOM = view.nodeDOM(position);
    const element = nodeDOM instanceof appWindow.HTMLElement ?
      nodeDOM :
      nodeDOM?.parentElement;
    const content = node.type.name === 'blockquote' ?
      element?.querySelector<HTMLElement>('[data-blockquote-content]') :
      node.type.name === 'detailsBody' ?
        element?.querySelector<HTMLElement>('.chat-input-details-content-inner') :
        element?.querySelector<HTMLElement>('[data-chat-input-list-item-content]');
    if(content?.contains(target)) result = {parentPosition: position};
  });
  return result;
}

function listContainerTargetAtTarget(
  view: EditorView,
  target: EventTarget | null
) {
  const appWindow = view.dom.ownerDocument.defaultView;
  if(
    !(target instanceof appWindow.Node) ||
    !view.dom.contains(target)
  ) return;
  let result: number | undefined;
  view.state.doc.descendants((node, position) => {
    if(!isListContainerNode(node)) return;
    const nodeDOM = view.nodeDOM(position);
    const element = nodeDOM instanceof appWindow.HTMLElement ?
      nodeDOM :
      nodeDOM?.parentElement;
    if(element?.contains(target)) result = position;
  });
  return result;
}

function structuralDropIndexAtY(
  view: EditorView,
  clientY: number,
  parentPosition?: number
) {
  const childCount = structuralContentCount(view.state.doc, parentPosition);
  for(let index = 0; index < childCount; ++index) {
    const element = structuralBlockElement(view, parentPosition, index);
    if(element) {
      const bounds = element.getBoundingClientRect();
      if(clientY < bounds.top + bounds.height / 2) return index;
    }
  }
  return childCount;
}

export function structuralDropTargetAtPoint(
  view: EditorView,
  source: ChatBlockRange,
  clientX: number,
  clientY: number,
  fallbackTarget?: EventTarget | null
): ChatBlockDropTarget | undefined {
  const hitTarget = pointerElementAtPoint(
    view,
    clientX,
    clientY,
    fallbackTarget
  );
  if(!hitTarget) return;
  const sourceParent = structuralContainerNode(
    view.state.doc,
    source.parentPosition
  );
  let parentPosition: number | undefined;
  if(isListContainerNode(sourceParent)) {
    const targetParentPosition = listContainerTargetAtTarget(view, hitTarget);
    if(targetParentPosition !== undefined) {
      parentPosition = targetParentPosition;
    } else {
      const container = blockContainerTargetAtTarget(view, hitTarget);
      if(!container) return;
      parentPosition = container.parentPosition;
    }
  } else {
    const container = blockContainerTargetAtTarget(view, hitTarget);
    if(!container) return;
    parentPosition = container.parentPosition;
  }

  const index = structuralDropIndexAtY(view, clientY, parentPosition);
  return validStructuralDropTarget(
    view.state.doc,
    source,
    parentPosition,
    index
  ) ? {index, parentPosition} : undefined;
}

export function hasReorderableStructuralContainer(doc: ProseMirrorNode) {
  if(topLevelContentCount(doc) > 1) return true;
  let reorderable = false;
  doc.descendants((node, position) => {
    if(
      isListContainerNode(node) && node.childCount > 1 ||
      isBlockContainerNode(node) &&
      structuralContentCount(doc, position) > 1
    ) reorderable = true;
  });
  return reorderable;
}

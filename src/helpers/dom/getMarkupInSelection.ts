/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {markdownTags, MarkdownType} from '@helpers/dom/getRichElementValue';

export default function getMarkupInSelection<T extends MarkdownType>(types: T[]) {
  type ResultByType = {elements: HTMLElement[], fully: boolean, partly: boolean, textLength: number};
  const result: Record<T, ResultByType> = {} as Record<T, ResultByType>;
  types.forEach((tag) => result[tag] = {elements: [], fully: false, partly: false, textLength: 0});
  const selection = window.getSelection();
  if(selection.isCollapsed) {
    return result;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const root = commonAncestor.nodeType === commonAncestor.ELEMENT_NODE ?
    commonAncestor as HTMLElement :
    (commonAncestor as ChildNode).parentElement;
  const contentEditable = root.closest('[contenteditable="true"]');
  if(!contentEditable) {
    return result;
  }

  const treeWalker = document.createTreeWalker(
    contentEditable,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT}
  );

  let nodes = 0, node: Node, textLength = 0;
  while(node = treeWalker.nextNode()) {
    ++nodes;
    const nodeValueLength = node.nodeValue?.length || 0;
    textLength += nodeValueLength;
    for(const type of types) {
      const tag = markdownTags[type];
      const _node = node.nodeType === node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
      const matches = _node.closest(tag.match);
      if(matches) {
        result[type].elements.push(_node);
        result[type].textLength += nodeValueLength;
      }
    }
  }

  for(const type of types) {
    const item = result[type];
    item.fully = item.textLength >= textLength;
    item.partly = !!item.elements.length;
  }

  return result;
}

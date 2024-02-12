/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {markdownTags, MarkdownType} from './getRichElementValue';

export default function getMarkupInSelection<T extends MarkdownType>(types: T[], onlyFull?: boolean) {
  const result: Record<T, {elements: HTMLElement[], active: boolean}> = {} as any;
  types.forEach((tag) => result[tag] = {elements: [], active: false});
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

  let nodes = 0, node: Node;
  while(node = treeWalker.nextNode()) {
    ++nodes;
    for(const type of types) {
      const tag = markdownTags[type];
      const _node = node.nodeType === node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
      const matches = _node.closest(tag.match);
      if(matches) {
        result[type].elements.push(_node);
      }
    }
  }

  for(const type of types) {
    result[type].active = result[type].elements.length >= (onlyFull ? nodes : 1);
  }

  return result;
}

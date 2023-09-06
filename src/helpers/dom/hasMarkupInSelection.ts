/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {markdownTags, MarkdownType} from './getRichElementValue';

export default function hasMarkupInSelection<T extends MarkdownType>(types: T[], onlyFull?: boolean) {
  const result: Record<T, number> = {} as any;
  types.forEach((tag) => result[tag] = 0);
  const selection = window.getSelection();
  let nodes = -1;
  if(!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const root = commonAncestor.nodeType === commonAncestor.ELEMENT_NODE ?
      commonAncestor as HTMLElement :
      (commonAncestor as ChildNode).parentElement;
    const contentEditable = root.closest('[contenteditable="true"]');
    const treeWalker = contentEditable ? document.createTreeWalker(
      contentEditable,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT}
    ) : undefined;

    if(treeWalker) {
      nodes = 0;
    }

    let node: Node;
    if(treeWalker) while(node = treeWalker.nextNode()) {
      ++nodes;
      for(const type of types) {
        const tag = markdownTags[type];
        const matches = (node.nodeType === node.ELEMENT_NODE ? node as HTMLElement : node.parentElement).closest(tag.match);
        if(matches) {
          ++result[type];
        }
      }
    }
  }

  const resultBoolean: Record<T, boolean> = {} as any;
  for(const type of types) {
    resultBoolean[type] = result[type] >= (onlyFull ? nodes : 1);
  }

  return resultBoolean;
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {markdownTags, MarkdownType} from './getRichElementValue';

export default function hasMarkupInSelection<T extends MarkdownType>(types: T[]) {
  const result: Record<T, boolean> = {} as any;
  types.forEach((tag) => result[tag] = false);
  const selection = window.getSelection();
  if(!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const treeWalker = document.createTreeWalker(
      (commonAncestor.nodeType === commonAncestor.ELEMENT_NODE ? commonAncestor as HTMLElement : (commonAncestor as ChildNode).parentElement).closest('[contenteditable="true"]'),
      NodeFilter.SHOW_ELEMENT,
      {acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT}
    );

    let element: HTMLElement;
    while(element = treeWalker.nextNode() as HTMLElement) {
      for(const type of types) {
        if(result[type]) {
          continue;
        }

        const tag = markdownTags[type];
        if(element.matches(tag.match)) {
          result[type] = true;
        }
      }
    }
  }

  return result;
}

/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import findUpAsChild from './findUpAsChild';

export default function getCaretPosNew(input: HTMLElement, anchor?: boolean): ReturnType<typeof getCaretPosF> & {selection: Selection} {
  const selection = document.getSelection();
  // let {focusNode: node, focusOffset: offset} = selection;
  const node = selection[anchor ? 'anchorNode' : 'focusNode'];
  const offset = selection[anchor ? 'anchorOffset' : 'focusOffset'];
  if(!findUpAsChild(node, input) && node !== input) {
    return {selection} as any;
  }

  return {...getCaretPosF(input, node, offset), selection};
}

export function getCaretPosF(input: HTMLElement, node: Node, offset: number) {
  if(node === input) {
    const childNodes = input.childNodes;
    const childNodesLength = childNodes.length;
    if(childNodesLength && offset >= childNodesLength) {
      node = childNodes[childNodesLength - 1];
      offset = (node.textContent || (node as HTMLImageElement).alt || '').length;
    } else {
      node = childNodes[offset];
      offset = 0;
    }
  }

  return {node: node as ChildNode, offset};
}

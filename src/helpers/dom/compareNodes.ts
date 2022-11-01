/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import clamp from '../number/clamp';
import findUpAsChild from './findUpAsChild';
import whichChild from './whichChild';

export default function compareNodes(node1: ChildNode, node1Offset: number, node2: ChildNode, node2Offset: number) {
  let diff: number;
  if(node1 === node2) {
    diff = node1Offset - node2Offset;
  } else if(node1.parentElement === node2.parentElement) {
    diff = whichChild(node1, true) - whichChild(node2, true);
  } else {
    const parents: HTMLElement[] = [];
    let parentElement = node1.parentElement;
    do {
      parents.push(parentElement);
    } while(parentElement = parentElement.parentElement);

    parentElement = node2.parentElement;
    do {
      if(parents.includes(parentElement)) {
        break;
      }
    } while(parentElement = parentElement.parentElement);

    const commonAncestorContainer = parentElement;
    // const range = document.createRange();
    // range.setStart(node1, 0);
    // range.setEnd(node2, node2.textContent.length);
    // const {commonAncestorContainer} = range;
    node1 = findUpAsChild(node1 as HTMLElement, commonAncestorContainer as HTMLElement);
    node2 = findUpAsChild(node2 as HTMLElement, commonAncestorContainer as HTMLElement);
    diff = whichChild(node1, true) - whichChild(node2, true);
  }

  return clamp(diff, -1, 1);
}

(window as any).compareNodes = compareNodes;

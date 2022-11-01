/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export default function setCaretAt(node: Node) {
  // node.appendChild(document.createTextNode(''));

  const originalNode = node;
  node = node.previousSibling;

  const needNewTextNode = node.nodeType === node.ELEMENT_NODE;
  if(needNewTextNode) {
    const newNode = document.createTextNode('');
    node.parentNode.insertBefore(newNode, !originalNode.nextSibling || originalNode.nextSibling.nodeType === node.nodeType ? originalNode : originalNode.nextSibling);
    node = newNode;
  }

  const range = document.createRange();
  if(node) {
    range.setStartAfter(node);
    range.insertNode(node);
    range.setStart(node, node.nodeValue.length);
  }

  range.collapse(true);

  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  if(needNewTextNode) {
    node.parentNode.removeChild(node);
  }
}

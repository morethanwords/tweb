export default function setCaretAt(node: Node) {
  // node.appendChild(document.createTextNode(''));

  const originalNode = node;
  node = node.previousSibling;

  const needNewTextNode = node.nodeType === node.ELEMENT_NODE;
  if(needNewTextNode) {
    const newNode = originalNode.ownerDocument.createTextNode('');
    node.parentNode.insertBefore(newNode, !originalNode.nextSibling || originalNode.nextSibling.nodeType === node.nodeType ? originalNode : originalNode.nextSibling);
    node = newNode;
  }

  const range = originalNode.ownerDocument.createRange();
  if(node) {
    range.setStartAfter(node);
    range.insertNode(node);
    range.setStart(node, node.nodeValue.length);
  }

  range.collapse(true);

  const sel = originalNode.ownerDocument.defaultView.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  if(needNewTextNode) {
    node.parentNode.removeChild(node);
  }
}

export function setCaretAtEnd(element: HTMLElement) {
  const range = element.ownerDocument.createRange();
  const selection = element.ownerDocument.defaultView.getSelection();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

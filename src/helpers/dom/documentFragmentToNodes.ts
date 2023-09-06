export default function documentFragmentToNodes(fragment: DocumentFragment) {
  const nodes: (Node | string)[] = new Array(fragment.childNodes.length);
  let node = fragment.firstChild;
  let i = 0;
  while(node) {
    nodes[i++] = node.nodeType === node.TEXT_NODE ? node.nodeValue : node;
    node = node.nextSibling;
  }
  return nodes;
}

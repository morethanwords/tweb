export default function getParents(elem: Node) {
  var parents: Node[] = [];
  while(elem.parentNode && elem.parentNode.nodeName.toLowerCase() != 'body') {
    elem = elem.parentNode;
    parents.push(elem);
  }
  return parents;
}

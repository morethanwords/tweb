// ! doesn't work for exact selection
// export default function isNodeFullyInsideRange(range: Range, node: Node): boolean {
//   const nodeRange = document.createRange();
//   nodeRange.selectNode(node);

//   console.log(range.compareBoundaryPoints(Range.START_TO_START, nodeRange), range.compareBoundaryPoints(Range.END_TO_END, nodeRange));
//   return (
//     range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
//     range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0
//   );
// }

// ! doesn't work for exact selection
// export default function isNodeFullyInsideRange(range: Range, node: Node): boolean {
//   const parent = node.parentNode;
//   // const parent = node.nodeType === node.TEXT_NODE ? node.parentNode : node;
//   if(!parent) return false;

//   const index = Array.prototype.indexOf.call(parent.childNodes, node);

//   console.log(range.comparePoint(parent, index), range.comparePoint(parent, index + 1));
//   return (
//     range.comparePoint(parent, index) >= 0 &&
//     range.comparePoint(parent, index + 1) <= 0
//   );
// }

// export default function isNodeFullyInsideRange(range: Range, node: Node): boolean {
//   const frag = range.cloneContents();
//   return frag.childNodes.length === 1 && frag.firstChild?.isEqualNode(node);
// }

export default function isNodeFullyInsideRange(range: Range, node: Node): boolean {
  if(!range.intersectsNode(node)) return false;

  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);

  return (
    range.compareBoundaryPoints(Range.START_TO_START, nodeRange) <= 0 &&
    range.compareBoundaryPoints(Range.END_TO_END, nodeRange) >= 0
  ) || range.toString() === node.textContent;
}

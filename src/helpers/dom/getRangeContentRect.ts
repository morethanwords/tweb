/**
 * The box of what a range selects: its text, line by line, and the leaf elements it covers (an
 * emoji's image). A range's own rect counts every element it wholly contains by that element's
 * box instead, so a Select All — which spans an editor's blocks, not their text — measures the
 * field's full width however short the text is.
 */
export default function getRangeContentRect(range: Range): DOMRectEditable {
  const root = range.commonAncestorContainer;
  if(root.nodeType === Node.TEXT_NODE) {
    return range.getBoundingClientRect();
  }

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const add = (rect: DOMRect) => {
    if(!rect.width) return;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  };

  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {acceptNode: (node) => range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT}
  );
  const piece = doc.createRange();
  for(let node = walker.nextNode(); node; node = walker.nextNode()) {
    if(node.nodeType === Node.TEXT_NODE) {
      piece.selectNodeContents(node);
      if(node === range.startContainer) piece.setStart(node, range.startOffset);
      if(node === range.endContainer) piece.setEnd(node, range.endOffset);
      for(const rect of piece.getClientRects()) add(rect);
    } else if(!node.hasChildNodes()) {
      add((node as Element).getBoundingClientRect());
    }
  }

  if(left === Infinity) {
    return range.getBoundingClientRect();
  }

  return {left, top, right, bottom, width: right - left, height: bottom - top};
}

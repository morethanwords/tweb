export default function getCharAfterRange(range: Range): string {
  // Создаем новый диапазон
  const newRange = document.createRange();

  // Если диапазон не находится в конце узла, устанавливаем новый диапазон
  if(range.endContainer.nodeType === Node.TEXT_NODE && range.endOffset < range.endContainer.nodeValue!.length) {
    newRange.setStart(range.endContainer, range.endOffset);
    newRange.setEnd(range.endContainer, range.endOffset + 1);
    return newRange.toString();
  }

  // Если диапазон находится в конце узла, и у узла есть следующий текстовый узел
  const nextTextNode = findNextTextNode(range.endContainer);
  if(nextTextNode) {
    newRange.setStart(nextTextNode, 0);
    newRange.setEnd(nextTextNode, Math.min(nextTextNode.nodeValue.length, 1));
    return newRange.toString();
  }
}

function findNextTextNode(node: Node): Text {
  while(node && !node.nextSibling) {
    node = node.parentNode!;
  }

  if(node && node.nextSibling) {
    return findFirstTextNode(node.nextSibling);
  }
}

function findFirstTextNode(node: Node): Text {
  if(node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  for(let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    const result = findFirstTextNode(child);
    if(result) {
      return result;
    }
  }
}

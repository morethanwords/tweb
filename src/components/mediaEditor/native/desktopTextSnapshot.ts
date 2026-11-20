/** Canonical contenteditable plaintext without innerText's soft-wrap newlines or
 * a layout read. This editor accepts plaintext only; DIV/P/BR are browser editing
 * structure, never formatting to preserve. Does not touch the live nodes.
 */
export default function snapshotDesktopText(root: HTMLElement): string {
  function read(node: Node): string {
    if(node.nodeType === Node.TEXT_NODE) return node.textContent;
    if(node.nodeName === 'BR') return '\n';
    const children = Array.from(node.childNodes);
    if(children.length === 1 && children[0].nodeName === 'BR') return '';
    let value = '';
    children.forEach((child, index) => {
      const block = child.nodeName === 'DIV' || child.nodeName === 'P';
      const previous = children[index - 1];
      const previousBlock = previous && (previous.nodeName === 'DIV' || previous.nodeName === 'P');
      if(index && (block || previousBlock) && !value.endsWith('\n')) value += '\n';
      // Adjacent empty block elements represent explicit blank paragraphs.
      else if(index && block && previousBlock) value += '\n';
      value += read(child);
    });
    return value;
  }
  return read(root).replace(/\r\n?/g, '\n');
}

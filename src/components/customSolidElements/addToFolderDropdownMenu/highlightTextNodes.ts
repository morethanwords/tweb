import styles from './styles.module.scss';

export default function highlightTextNodes(node: Node, indicies: number[]) {
  const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);

  const nodes: Node[] = [];

  while(treeWalker.nextNode()) {
    const node = treeWalker.currentNode;
    nodes.push(node);
  }

  let acc = 0;

  for(const node of nodes) {
    const n = node.nodeValue.length;
    const str = node.nodeValue;

    const localIndicies = indicies.filter(i => i >= acc && i < acc + n).map(i => i - acc);
    acc += n;

    const fragment = document.createDocumentFragment();
    let prevli = -1, highlight: HTMLElement;

    for(const li of localIndicies) {
      fragment.append(str.slice(prevli + 1, li));

      if(prevli === -1 || prevli + 1 < li) {
        highlight = makeHighlight();
      }
      highlight.textContent += str[li];
      prevli = li;
    }

    fragment.append(str.slice(prevli + 1, n));

    node.parentNode.replaceChild(fragment, node);

    function makeHighlight() {
      const el = document.createElement('span');
      el.classList.add(styles.Highlight);
      fragment.append(el);
      return el;
    }
  }
}

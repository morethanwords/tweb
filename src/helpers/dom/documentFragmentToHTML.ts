export default function documentFragmentToHTML(fragment: DocumentFragment) {
  return Array.from(fragment.childNodes).map((node) => {
    return node.nodeType === 3 ? node.textContent : (node as Element).outerHTML + '\n';
  }).join('');
}

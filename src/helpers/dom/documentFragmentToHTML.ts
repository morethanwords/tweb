import encodeEntities from '../string/encodeEntities';

export default function documentFragmentToHTML(fragment: DocumentFragment) {
  return Array.from(fragment.childNodes).map((node) => {
    return node.nodeType === node.TEXT_NODE ? encodeEntities(node.textContent) : (node as Element).outerHTML;
  }).join('');
}

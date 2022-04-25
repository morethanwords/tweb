import encodeEntities from "../string/encodeEntities";

export default function documentFragmentToHTML(fragment: DocumentFragment) {
  return Array.from(fragment.childNodes).map((node) => {
    return node.nodeType === 3 ? encodeEntities(node.textContent) : (node as Element).outerHTML;
  }).join('');
}

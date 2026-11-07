/** An empty element of `element`'s tag, classes and inline style: what styles it through its descendants styles them in it too. */
export default function shallowCopy<T extends HTMLElement>(element: T): T {
  const copy = document.createElement(element.tagName) as T;
  copy.className = element.className;
  copy.style.cssText = element.style.cssText;
  return copy;
}

// * jsdom lays nothing out: an element the focus trap may stop at says it has a size
export default function makeVisible<T extends HTMLElement>(element: T) {
  Object.defineProperty(element, 'offsetWidth', {configurable: true, value: 1});
  return element;
}

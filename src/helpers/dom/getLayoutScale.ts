import getLayoutWidth from '@helpers/dom/getLayoutWidth';

/**
 * How much bigger an element is drawn than it is laid out (a transform on it or above it), from its box on screen,
 * already measured: what is put in it stands in its own pixels, which the screen's are divided by. 1 for an element
 * not laid out. A read of the layout
 */
export default function getLayoutScale(element: HTMLElement, box: {left: number, right: number}) {
  const width = getLayoutWidth(element);
  return width ? (box.right - box.left) / width || 1 : 1;
}

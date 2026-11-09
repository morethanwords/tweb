/**
 * The width an element is laid out to - fractional, unlike `offsetWidth`, and with its transforms
 * aside, unlike `getBoundingClientRect` - or 0 for one not laid out. A read of the layout
 */
export default function getLayoutWidth(element: HTMLElement) {
  // * the element's own window: one of another document (a Picture-in-Picture one) is styled there
  return parseFloat((element.ownerDocument.defaultView || window).getComputedStyle(element).width) || 0;
}

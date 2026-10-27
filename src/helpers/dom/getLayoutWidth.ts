/**
 * The width an element is laid out to - fractional, unlike `offsetWidth`, and with its transforms
 * aside, unlike `getBoundingClientRect` - or 0 for one not laid out. A read of the layout
 */
export default function getLayoutWidth(element: HTMLElement) {
  return parseFloat(getComputedStyle(element).width) || 0;
}

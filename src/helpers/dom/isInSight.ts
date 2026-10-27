/**
 * Whether an element can be seen: laid out, within the viewport, and not hidden by an ancestor's
 * opacity or visibility - the chat list of a narrow screen with a chat open over it. A read of
 * the layout: for a measure phase (`sequentialDom.measure`)
 */
export default function isInSight(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return !!rect.width &&
    rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth &&
    (element.checkVisibility?.({opacityProperty: true, visibilityProperty: true}) ?? true);
}

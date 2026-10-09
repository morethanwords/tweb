/**
 * The corners `element` is drawn with on screen (tl, tr, br, bl), in viewport px: its own radii,
 * and those of each clipping ancestor (overflow != visible) up to `clippingBoundary` - but only at a
 * corner `element` shares with that ancestor, so interior items of a rounded container (an album, the
 * shared media grid) don't pick up the outer rounding while a corner item does.
 */
export default function getEffectiveCornerRadii(
  element: HTMLElement,
  elementRect: DOMRectMinified,
  clippingBoundary?: HTMLElement
): [number, number, number, number] {
  const TOLERANCE = 1.5; // sub-pixel + grid-gap slack
  const radii: [number, number, number, number] = [0, 0, 0, 0];

  const elementStyle = window.getComputedStyle(element);
  radii[0] = parseFloat(elementStyle.borderTopLeftRadius) || 0;
  radii[1] = parseFloat(elementStyle.borderTopRightRadius) || 0;
  radii[2] = parseFloat(elementStyle.borderBottomRightRadius) || 0;
  radii[3] = parseFloat(elementStyle.borderBottomLeftRadius) || 0;

  const body = element.ownerDocument.body;
  let ancestor = element.parentElement;
  let depth = 0;
  while(ancestor && ancestor !== body && depth++ < 12) {
    const aStyle = window.getComputedStyle(ancestor);
    if(aStyle.overflow !== 'visible') {
      const aTL = parseFloat(aStyle.borderTopLeftRadius) || 0;
      const aTR = parseFloat(aStyle.borderTopRightRadius) || 0;
      const aBR = parseFloat(aStyle.borderBottomRightRadius) || 0;
      const aBL = parseFloat(aStyle.borderBottomLeftRadius) || 0;

      if(aTL || aTR || aBR || aBL) {
        const aRect = ancestor.getBoundingClientRect();
        const sameLeft = Math.abs(elementRect.left - aRect.left) < TOLERANCE;
        const sameRight = Math.abs(elementRect.right - aRect.right) < TOLERANCE;
        const sameTop = Math.abs(elementRect.top - aRect.top) < TOLERANCE;
        const sameBottom = Math.abs(elementRect.bottom - aRect.bottom) < TOLERANCE;

        if(aTL && sameLeft && sameTop) radii[0] = Math.max(radii[0], aTL);
        if(aTR && sameRight && sameTop) radii[1] = Math.max(radii[1], aTR);
        if(aBR && sameRight && sameBottom) radii[2] = Math.max(radii[2], aBR);
        if(aBL && sameLeft && sameBottom) radii[3] = Math.max(radii[3], aBL);
      }
    }

    if(ancestor === clippingBoundary) break;
    ancestor = ancestor.parentElement;
  }

  return radii;
}

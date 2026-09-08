export interface ViewportBounds {left: number; top: number; width: number; height: number}
export interface AnchorBounds {left: number; right: number; top: number; bottom: number}
export interface InspectorPosition {
  left: number;
  top: number;
  width: number;
  height: number;
  maxHeight: number;
  placement: 'below' | 'above' | 'clamped' | 'bottom-sheet';
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** All coordinates use the layout viewport; visualViewport offsets define its visible portion. */
export function inspectorPosition(viewport: ViewportBounds, anchor: AnchorBounds | null, measuredHeight: number, mobile: boolean): InspectorPosition {
  const margin = mobile ? 8 : Math.min(16, viewport.width / 2, viewport.height / 2);
  const width = mobile ? viewport.width : Math.min(336, Math.max(0, viewport.width - margin * 2));
  const maxHeight = Math.max(0, viewport.height - margin * (mobile ? 1 : 2));
  const height = clamp(measuredHeight, 0, maxHeight);
  if(mobile) return {left: viewport.left, top: viewport.top + viewport.height - height, width, height, maxHeight, placement: 'bottom-sheet'};

  const minLeft = viewport.left + margin;
  const maxLeft = viewport.left + viewport.width - margin - width;
  const minTop = viewport.top + margin;
  const maxTop = viewport.top + viewport.height - margin - height;
  const left = clamp(anchor?.left ?? viewport.left + (viewport.width - width) / 2, minLeft, maxLeft);
  const visibleAnchor = anchor && anchor.bottom >= minTop && anchor.top <= viewport.top + viewport.height - margin
    && anchor.right >= minLeft && anchor.left <= viewport.left + viewport.width - margin;
  if(visibleAnchor) {
    const below = anchor.bottom + 10;
    if(below >= minTop && below <= maxTop) return {left, top: below, width, height, maxHeight, placement: 'below'};
    const above = anchor.top - 10 - height;
    if(above >= minTop && above <= maxTop) return {left, top: above, width, height, maxHeight, placement: 'above'};
    return {left, top: clamp(below, minTop, maxTop), width, height, maxHeight, placement: 'clamped'};
  }
  return {left, top: clamp(viewport.top + (viewport.height - height) / 2, minTop, maxTop), width, height, maxHeight, placement: 'clamped'};
}

import BezierEasing from '../../vendor/bezierEasing';

export const SPAN_BOUNDING_BOX_THRESHOLD_Y = 1; // cover space between lines of the message;
export const UnwrapEasing = BezierEasing(0.45, 0.37, 0.29, 1);

export type CustomDOMRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};


export function getInnerCustomRect(parentRect: DOMRect, rect: CustomDOMRect): CustomDOMRect {
  return {
    left: rect.left - parentRect.left,
    top: rect.top - parentRect.top,
    width: rect.width,
    height: rect.height
  };
}

export function getActualRectForCustomRect(parentRect: DOMRect, rect: CustomDOMRect): CustomDOMRect {
  return {
    left: parentRect.left + rect.left,
    top: parentRect.top + rect.top,
    width: rect.width,
    height: rect.height
  };
}

export function computeMaxDistToMargin(e: MouseEvent, rect: DOMRect) {
  return Math.max(
    Math.hypot(e.clientX - rect.left, e.clientY - rect.top),
    Math.hypot(e.clientX - rect.left, e.clientY - rect.bottom),
    Math.hypot(e.clientX - rect.right, e.clientY - rect.top),
    Math.hypot(e.clientX - rect.right, e.clientY - rect.bottom)
  );
}

export function getTimeForDist(dist: number) {
  // per 160px move time = 400ms
  return Math.min(600, (dist / 160) * 400);
}

export function toDOMRectArray(list: DOMRectList) {
  const result: DOMRect[] = [];
  for(let i = 0; i < list.length; i++) {
    result.push(list.item(i));
  }
  return result;
}

export function isMouseCloseToAnySpoilerElement(e: MouseEvent, parentElement: HTMLElement, spanRects: CustomDOMRect[]) {
  const overlayRect = parentElement.getBoundingClientRect();

  for(const rect of spanRects) {
    const actualRect = getActualRectForCustomRect(overlayRect, rect);

    if(
      actualRect.left <= e.clientX &&
      e.clientX <= actualRect.left + actualRect.width &&
      actualRect.top - SPAN_BOUNDING_BOX_THRESHOLD_Y <= e.clientY &&
      e.clientY <= actualRect.top + actualRect.height + SPAN_BOUNDING_BOX_THRESHOLD_Y
    )
      return true;
  }

  return false;
}

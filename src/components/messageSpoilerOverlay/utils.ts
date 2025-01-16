import {animate} from '../../helpers/animation';
import deferredPromise from '../../helpers/cancellablePromise';
import themeController from '../../helpers/themeController';
import {logger} from '../../lib/logger';
import BezierEasing from '../../vendor/bezierEasing';

export const SPAN_BOUNDING_BOX_THRESHOLD_Y = 1; // cover space between lines of the message;
export const UnwrapEasing = BezierEasing(0.45, 0.37, 0.29, 1);

const RESIZE_PAINT_CHECK_ATTEMPTS = 100;
const RESIZE_PAINT_COMPARISON_ERROR = 0.1;

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

export function getParticleColor() {
  return themeController.isNight() ? 'white' : '#101010';
}

const resizeLog = logger('resize-paint');

// The element is not immediately the size we need after the resize callback was triggered, so we need to wait until the changes are applied in the DOM
export async function waitResizeToBePainted(resizeEntry: ResizeObserverEntry) {
  const deferred = deferredPromise<void>();

  let attempts = 0;

  const entryRect = resizeEntry.contentRect;

  animate(() => {
    const targetRect = resizeEntry.target.getBoundingClientRect();
    if(
      Math.abs(targetRect.width - entryRect.width) < RESIZE_PAINT_COMPARISON_ERROR &&
      Math.abs(targetRect.height - entryRect.height) < RESIZE_PAINT_COMPARISON_ERROR
    ) {
      deferred.resolve();
      resizeLog('Resize was painted after attempts :>> ', attempts);
      return;
    }

    return attempts++ < RESIZE_PAINT_CHECK_ATTEMPTS || deferred.reject();
  });

  return deferred;
}

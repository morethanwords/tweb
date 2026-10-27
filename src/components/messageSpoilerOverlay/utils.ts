import {unwrapEasing} from '@helpers/easings';
import themeController from '@helpers/themeController';

export const UnwrapEasing = unwrapEasing;

const MAX_SPACE_BETWEEN_SPOILER_LINES = 2;

export type CustomDOMRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
};

type RGBA = Record<'a' | 'r' | 'g' | 'b', number>;


export function getInnerCustomRect(parentRect: DOMRect, rect: CustomDOMRect): CustomDOMRect {
  return {
    left: Math.floor(rect.left - parentRect.left),
    top: Math.floor(rect.top - parentRect.top),
    width: Math.ceil(rect.width + 0.99),
    height: Math.ceil(rect.height + 0.99)
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

export function computeMaxDistToMargin(e: MouseEvent, parentRect: DOMRect, rects: CustomDOMRect []) {
  const actualRects = rects.map((rect) => getActualRectForCustomRect(parentRect, rect));

  return Math.max(...actualRects.map((rect) => Math.max(
    Math.hypot(e.clientX - rect.left, e.clientY - rect.top),
    Math.hypot(e.clientX - rect.left, e.clientY - (rect.top + rect.height)),
    Math.hypot(e.clientX - (rect.left + rect.width), e.clientY - rect.top),
    Math.hypot(e.clientX - (rect.left + rect.width), e.clientY - (rect.top + rect.height))
  )));;
}

export function getTimeForDist(dist: number) {
  return Math.max(600, Math.sqrt((dist / 160)) * 350);
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
      actualRect.top <= e.clientY &&
      e.clientY <= actualRect.top + actualRect.height
    )
      return true;
  }

  return false;
}

export function getParticleColor() {
  return themeController.isNight() ? 'white' : '#101010';
}

function parseRgba(rgba: string): RGBA {
  const match = rgba.match(/rgba?\((\d+), (\d+), (\d+),?\s?(\d?.?\d+)?\)/);
  if(!match) return {
    r: 0, g: 0, b: 0, a: 0
  };
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: parseFloat(match[4] ?? '1')
  };
}

function blendColors(base: RGBA, overlay: RGBA): RGBA {
  const blendedAlpha = overlay.a + base.a * (1 - overlay.a);
  const r = Math.round(
    (overlay.a * overlay.r + base.a * base.r * (1 - overlay.a)) / blendedAlpha
  );
  const g = Math.round(
    (overlay.a * overlay.g + base.a * base.g * (1 - overlay.a)) / blendedAlpha
  );
  const b = Math.round(
    (overlay.a * overlay.b + base.a * base.b * (1 - overlay.a)) / blendedAlpha
  );
  return {
    r,
    g,
    b,
    a: blendedAlpha
  };
}

export function computeFinalBackgroundColor(element: HTMLElement) {
  let color = {r: 0, g: 0, b: 0, a: 0};
  let maxDepth = 10;

  while(element && color.a < 1 && maxDepth--) {
    const bgColor = window.getComputedStyle(element).backgroundColor;
    if(bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      const rgba = parseRgba(bgColor);
      color = blendColors(rgba, color);
    }
    element = element.parentElement;
  }

  return color.a === 1 ? `rgb(${color.r}, ${color.g}, ${color.b})` : undefined;
}

/**
 * The part of the page a spoiler can be seen in: inside every box between it and the message
 * that clips what overflows it - a collapsed quote, the content of a details that is closed or opening.
 * Drawn outside of it, the dots of a hidden spoiler covered the text next to it.
 */
function getSpoilerClipRect(el: HTMLElement, root: HTMLElement) {
  let clip: {left: number, top: number, right: number, bottom: number};
  for(let element = el.parentElement; element && element !== root; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if(style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const rect = element.getBoundingClientRect();
    clip = clip ? {
      left: Math.max(clip.left, rect.left),
      top: Math.max(clip.top, rect.top),
      right: Math.min(clip.right, rect.right),
      bottom: Math.min(clip.bottom, rect.bottom)
    } : {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
  }

  return clip;
}

export function getCustomDOMRectsForSpoilerSpan(el: HTMLElement, parentRect: DOMRect, root: HTMLElement): CustomDOMRect[] {
  const color = computeFinalBackgroundColor(el);
  const clip = getSpoilerClipRect(el, root);

  return toDOMRectArray(el.getClientRects())
  .map((rect): CustomDOMRect => {
    if(!clip) return rect;
    const left = Math.max(rect.left, clip.left), top = Math.max(rect.top, clip.top);
    return {left, top, width: Math.min(rect.right, clip.right) - left, height: Math.min(rect.bottom, clip.bottom) - top};
  })
  .filter((rect) => rect.width > 0 && rect.height > 0)
  .map((spoilerRect) => ({...getInnerCustomRect(parentRect, spoilerRect), color}));
}

export function adjustSpaceBetweenCloseRects(rects: CustomDOMRect[]): CustomDOMRect[] {
  rects = [...rects].sort((a, b) => a.top - b.top);

  for(let idx = 0; idx < rects.length - 1; idx++) {
    const rect = rects[idx];

    let nextIdx = idx ;
    while(++nextIdx < rects.length) {
      const nextRect = rects[nextIdx];

      const dist = nextRect.top - (rect.top + rect.height);
      if(dist <= MAX_SPACE_BETWEEN_SPOILER_LINES) {
        if(dist < 0) continue;

        const flooredHalfDist = Math.floor(dist / 2); //  try to make whole pixels
        const restHalfDist = dist - flooredHalfDist;

        rects[nextIdx] = {...nextRect, top: nextRect.top - flooredHalfDist, height: nextRect.height + flooredHalfDist};
        rects[idx] = {...rect, height: rect.height + restHalfDist};
      } else break;
    }
  }

  return rects;
}

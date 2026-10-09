import findUpClassName from '@helpers/dom/findUpClassName';
import getVisibleRect from '@helpers/dom/getVisibleRect';
import windowSize from '@helpers/windowSize';

type MediaViewerVisibleRect = {
  rect: {
    top: number,
    right: number,
    bottom: number,
    left: number
  },
  overflow: {
    top: boolean,
    right: boolean,
    bottom: boolean,
    left: boolean
  }
};

// * how far in from each side of the viewport its clipping ancestor cuts
export function getMediaViewerClipInsets(options: {
  visibleRect: MediaViewerVisibleRect,
  viewportWidth: number,
  viewportHeight: number
}) {
  const {visibleRect, viewportWidth, viewportHeight} = options;
  const {rect, overflow} = visibleRect;

  // Mask only the sides actually hidden by a clipping ancestor. Using the
  // thumbnail's other edges would trap the growing mover inside its source rect.
  return {
    top: overflow.top ? Math.max(0, rect.top) : 0,
    right: overflow.right ? Math.max(0, viewportWidth - rect.right) : 0,
    bottom: overflow.bottom ? Math.max(0, viewportHeight - rect.bottom) : 0,
    left: overflow.left ? Math.max(0, rect.left) : 0
  };
}

function toClipPath({top, right, bottom, left}: ReturnType<typeof getMediaViewerClipInsets>) {
  return `inset(${top}px ${right}px ${bottom}px ${left}px)`;
}

export default function getMediaViewerClipPath(options: Parameters<typeof getMediaViewerClipInsets>[0]) {
  return toClipPath(getMediaViewerClipInsets(options));
}

/**
 * How much of `element` its scrolling area shows, and - when the area cuts it - the clip that
 * reproduces the area's edges in viewport pixels, for what is opened from it to grow out from under
 * them. In a chat the area is the bubbles' viewport between the topbar and the input, not the
 * scrollable, which runs on under both
 */
export function getMediaSourceClip(element: HTMLElement, rect: DOMRectMinified = element.getBoundingClientRect()) {
  const overflowElement = findUpClassName(element, 'scrollable');
  if(!overflowElement) {
    return {};
  }

  let overflowRect: DOMRectMinified;
  // * only the bubbles run on under the topbar and the input: a chat's panels (stickers, emoji, GIFs)
  // * scroll in areas of their own
  const bubblesViewport = findUpClassName(overflowElement, 'bubbles') &&
    findUpClassName(element, 'chat')?.querySelector<HTMLElement>(':scope > .bubbles-viewport');
  if(bubblesViewport) {
    const baseRect = overflowElement.getBoundingClientRect();
    const viewportRect = bubblesViewport.getBoundingClientRect();
    overflowRect = {
      top: Math.max(baseRect.top, viewportRect.top),
      right: Math.min(baseRect.right, viewportRect.right),
      bottom: Math.min(baseRect.bottom, viewportRect.bottom),
      left: Math.max(baseRect.left, viewportRect.left)
    };
  }

  const visibleRect = getVisibleRect(element, overflowElement, true, rect, overflowRect);
  const insets = visibleRect && (visibleRect.overflow.vertical || visibleRect.overflow.horizontal) ?
    getMediaViewerClipInsets({visibleRect, viewportWidth: windowSize.width, viewportHeight: windowSize.height}) :
    undefined;
  const clipPath = insets && toClipPath(insets);
  // * on screen, and not cut on both sides: a view can close back into it rather than fade out where it is
  const canCloseInto = !!visibleRect && visibleRect.overflow.vertical !== 2 && visibleRect.overflow.horizontal !== 2;
  return {overflowElement, visibleRect, insets, clipPath, canCloseInto};
}

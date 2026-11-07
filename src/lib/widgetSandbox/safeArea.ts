import type {ContentSafeArea} from 'widget-sandbox/host/widget-host';

/**
 * The content safe area (widget-sandbox docs/sdk-v1.md §2.17, §5.12): a widget with no caption below it has the
 * message's time drawn over its bottom corner, as a photo has, and is told the band and the corner the time takes, so
 * that it keeps what is tapped out from under it.
 */

export const NO_CONTENT_SAFE_AREA: ContentSafeArea = {top: 0, right: 0, bottom: 0, left: 0, cornerLeft: 0, cornerRight: 0};

/** The most the widget takes (the framework's range: a value past it would count as none). */
const MAX_INSET = 64;
const MAX_CORNER = 200;

/**
 * Where `element` is laid out in `ancestor` (from its padding edge), by the offsets, which no transform moves: the
 * chat scales while it opens and moves a bubble's attachment while an edit changes it (bubbleTransitions). Undefined
 * when `ancestor` is not on the element's offset chain.
 */
function layoutBox(element: HTMLElement, ancestor: Element) {
  let left = 0, top = 0;
  let node = element;
  while(node && node !== ancestor) {
    left += node.offsetLeft;
    top += node.offsetTop;
    const parent = node.offsetParent as HTMLElement;
    // an offset is from the parent's padding edge, the parent's own offset to its border edge
    if(parent && parent !== ancestor) {
      left += parent.clientLeft;
      top += parent.clientTop;
    }

    node = parent;
  }

  if(node !== ancestor) return;
  return {left, top, right: left + element.offsetWidth, bottom: top + element.offsetHeight};
}

/**
 * The band and the corner `time` takes over `block`, as both are laid out: the band is the time's backing with its
 * margin above and below it, the corner its width with its margin on both sides, on the interface's side (the right
 * left to right, the left right to left). The chat's floating time stands as far from the bottom edge as from the side
 * (`.time.is-floating`), so the margin is read from the side: the bottom edge it stands on may be another element's
 * (a channel post's comments footer, which lifts it over itself and which the staged copy of the bubble has not got),
 * and before the widget has drawn the block may have no height yet. None when the time is below the block (a caption's
 * line) or not there.
 */
export function measureContentSafeArea(block: HTMLElement, time: HTMLElement | undefined, rtl: boolean): ContentSafeArea {
  const ancestor = time?.isConnected && block.isConnected && time.offsetParent;
  if(!ancestor || !time.offsetWidth || !time.offsetHeight) return NO_CONTENT_SAFE_AREA;
  const area = layoutBox(block, ancestor);
  const rect = layoutBox(time, ancestor);
  if(!area || !rect) return NO_CONTENT_SAFE_AREA;
  const side = rtl ? rect.left - area.left : area.right - rect.right;
  // a time elsewhere (in a caption's line below the block) covers nothing of it
  if(rect.bottom > area.bottom + 1 || side < -1 || side > (area.right - area.left) / 2) return NO_CONTENT_SAFE_AREA;
  const margin = Math.max(0, side);
  const bottom = Math.min(MAX_INSET, time.offsetHeight + 2 * margin);
  const corner = Math.min(MAX_CORNER, time.offsetWidth + 2 * margin);
  return {...NO_CONTENT_SAFE_AREA, bottom, [rtl ? 'cornerLeft' : 'cornerRight']: corner};
}

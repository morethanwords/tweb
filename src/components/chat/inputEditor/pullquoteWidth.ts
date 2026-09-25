import {observeResize} from '@components/resizeObserver';

// CSS balance changes the line breaks, but not the shrink-to-fit width. Measure
// those balanced lines at the available width and fit the panel around them.
export default function fitPullquoteWidth(element: HTMLElement) {
  const document = element.ownerDocument;
  const view = document.defaultView!;
  let frame: number | undefined;
  let destroyed = false;
  let parent: HTMLElement;
  let parentWidth: number | undefined;
  let unobserveParent: VoidFunction;

  const update = () => {
    frame = undefined;
    if(destroyed || !element.isConnected) return;
    if(parent !== element.parentElement) {
      unobserveParent?.();
      parent = element.parentElement;
      parentWidth = undefined;
      if(parent) unobserveParent = observeResize(parent, (entry) => {
        if(entry.contentRect.width === parentWidth) return;
        parentWidth = entry.contentRect.width;
        schedule();
      });
    }

    element.style.removeProperty('width');
    const naturalWidth = element.getBoundingClientRect().width;
    if(!naturalWidth) return;
    const style = view.getComputedStyle(element);
    const availableWidth = parseFloat(style.width);
    const scale = naturalWidth / availableWidth;
    let textWidth = 0;
    const range = document.createRange();
    for(const child of element.children) {
      range.selectNodeContents(child);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
      if(!rects.length) continue;
      const left = Math.min(...rects.map((rect) => rect.left));
      const right = Math.max(...rects.map((rect) => rect.right));
      textWidth = Math.max(textWidth, (right - left) / scale);
    }
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
      parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
    const width = Math.ceil(textWidth + padding);
    if(width < availableWidth - 1) element.style.width = `${width}px`;
  };
  const schedule = () => {
    if(destroyed || frame !== undefined) return;
    frame = view.requestAnimationFrame(update);
  };
  document.fonts?.addEventListener('loadingdone', schedule);
  schedule();

  return {
    update: schedule,
    destroy: () => {
      destroyed = true;
      if(frame !== undefined) view.cancelAnimationFrame(frame);
      unobserveParent?.();
      document.fonts?.removeEventListener('loadingdone', schedule);
    }
  };
}

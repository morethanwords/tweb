import type {TextRenderingInfoLine} from '@components/mediaEditor/types';

/** Static line boxes used by both the editable and isolated Desktop measurement. */
export default function getLinesRenderingInfo(linesContainer: HTMLDivElement, alignment: string, normalized = false): TextRenderingInfoLine[] {
  return Array.from(linesContainer.children).map((_child) => {
    const child = _child as HTMLElement;
    let offset = 0;
    if(alignment === 'left') {
      offset = 0;
    } else if(alignment === 'center') {
      offset = (linesContainer.clientWidth - child.clientWidth) / 2;
    } else {
      offset = linesContainer.clientWidth - child.clientWidth;
    }
    return {
      left: offset,
      right: offset + child.clientWidth,
      // A normalized measuring copy is hidden, so innerText would return empty.
      content: normalized ? child.textContent : child.innerText,
      height: child.clientHeight
    };
  });
}

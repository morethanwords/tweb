import {StandardLonghandPropertiesHyphen} from 'csstype';
import {Accessor, onCleanup} from 'solid-js';
import useGlobalDocumentEvent from './useGlobalDocumentEvent';


export type SwipeDirectiveArgs = {
  globalCursor?: StandardLonghandPropertiesHyphen['cursor'];
  onStart?: (e: PointerEvent) => void;
  onMove?: (xDiff: number, yDiff: number, e: PointerEvent) => void;
  onEnd?: (xDiff: number, yDiff: number, e: PointerEvent) => void;
};

declare module 'solid-js' {
  namespace JSX {
    interface Directives {
      swipe: SwipeDirectiveArgs;
    }
  }
}

export default function swipe(element: HTMLElement, args: Accessor<SwipeDirectiveArgs>) {
  let isDragging = false;
  let initialX: number, initialY: number;

  const getDiff = (e: PointerEvent) => [
    e.clientX - initialX,
    e.clientY - initialY
  ] as const;

  element.addEventListener('pointerdown', (e) => {
    isDragging = true;
    initialX = e.clientX;
    initialY = e.clientY;

    const {onStart, globalCursor} = args();
    onStart?.(e);

    globalCursor && document.body.style.setProperty('cursor', globalCursor, 'important');
  });

  useGlobalDocumentEvent('pointermove', (e) => {
    if(!isDragging) return;

    const {onMove} = args();
    onMove?.(...getDiff(e), e);
  });

  useGlobalDocumentEvent('pointerup', (e) => {
    if(!isDragging) return;

    const {onEnd, globalCursor} = args();
    onEnd?.(...getDiff(e), e);
    globalCursor && document.body.style.removeProperty('cursor');

    isDragging = false;
    initialX = initialY = undefined;
  });
}

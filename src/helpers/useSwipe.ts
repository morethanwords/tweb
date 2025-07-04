import {StandardLonghandPropertiesHyphen} from 'csstype';
import {Accessor, onCleanup} from 'solid-js';
import useGlobalDocumentEvent from './useGlobalDocumentEvent';


export type SwipeDirectiveArgs = {
  globalCursor?: Accessor<StandardLonghandPropertiesHyphen['cursor']>;
  onStart?: (e: PointerEvent | TouchEvent) => void;
  onMove?: (xDiff: number, yDiff: number, e: PointerEvent | TouchEvent) => void;
  onEnd?: (xDiff: number, yDiff: number, e: PointerEvent | TouchEvent) => void;
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

  const getDiffPointer = (e: PointerEvent) => [
    e.clientX - initialX,
    e.clientY - initialY
  ] as const;

  const getDiffTouch = (e: TouchEvent) => [
    e.changedTouches[0].clientX - initialX,
    e.changedTouches[0].clientY - initialY
  ] as const;

  function handleStart(e: PointerEvent | TouchEvent, x: number, y: number) {
    if(isDragging) return;
    isDragging = true;
    initialX = x;
    initialY = y;

    const {onStart, globalCursor} = args();
    onStart?.(e);

    if(globalCursor) {
      document.body.style.setProperty('cursor', globalCursor(), 'important');
      element.style.setProperty('cursor', globalCursor(), 'important');
    }
  }

  function handleMove(e: PointerEvent | TouchEvent, diff: readonly [number, number]) {
    if(!isDragging) return;

    const {onMove} = args();
    onMove?.(...diff, e);
  }

  function handleEnd(e: PointerEvent | TouchEvent, diff: readonly [number, number]) {
    if(!isDragging) return;

    const {onEnd, globalCursor} = args();
    onEnd?.(...diff, e);
    if(globalCursor) {
      document.body.style.removeProperty('cursor');
      element.style.removeProperty('cursor');
    }

    isDragging = false;
    initialX = initialY = undefined;
  }

  element.addEventListener('pointerdown', (e) => {
    handleStart(e, e.clientX, e.clientY);
  });

  element.addEventListener('touchstart', (e) => {
    handleStart(e, e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  });

  useGlobalDocumentEvent('pointermove', (e) => {
    handleMove(e, getDiffPointer(e));
  });

  useGlobalDocumentEvent('touchmove', (e) => {
    handleMove(e, getDiffTouch(e));
  });

  useGlobalDocumentEvent('pointermove', (e) => {
    handleMove(e, getDiffPointer(e));
  });

  useGlobalDocumentEvent('pointerup', (e) => {
    handleEnd(e, getDiffPointer(e));
  });

  useGlobalDocumentEvent('touchend', (e) => {
    handleEnd(e, getDiffTouch(e));
  });
}

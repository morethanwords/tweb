/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export type GrabEvent = {x: number, y: number, isTouch?: boolean};

export default function attachGrabListeners(element: HTMLElement, 
  onStart: (position: GrabEvent) => void, 
  onMove: (position: GrabEvent) => void, 
  onEnd?: (position: GrabEvent) => void) {
  // * Mouse
  const onMouseMove = (event: MouseEvent) => {
    onMove({x: event.pageX, y: event.pageY});
  };

  const onMouseUp = (event: MouseEvent) => {
    document.removeEventListener('mousemove', onMouseMove);
    element.addEventListener('mousedown', onMouseDown, {once: true});
    onEnd && onEnd({x: event.pageX, y: event.pageY});
  };

  const onMouseDown = (event: MouseEvent) => {
    if(event.button !== 0) {
      element.addEventListener('mousedown', onMouseDown, {once: true});
      return;
    }

    onStart({x: event.pageX, y: event.pageY});
    onMouseMove(event);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp, {once: true});
  };

  element.addEventListener('mousedown', onMouseDown, {once: true});

  // * Touch
  const onTouchMove = (event: TouchEvent) => {
    event.preventDefault();
    onMove({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true});
  };

  const onTouchEnd = (event: TouchEvent) => {
    document.removeEventListener('touchmove', onTouchMove);
    element.addEventListener('touchstart', onTouchStart, {passive: false, once: true});
    onEnd && onEnd({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true});
  };

  const onTouchStart = (event: TouchEvent) => {
    onStart({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true});
    onTouchMove(event);

    document.addEventListener('touchmove', onTouchMove, {passive: false});
    document.addEventListener('touchend', onTouchEnd, {passive: false, once: true});
  };

  element.addEventListener('touchstart', onTouchStart, {passive: false, once: true});

  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    element.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
  };
}

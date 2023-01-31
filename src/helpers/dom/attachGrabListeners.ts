/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export type GrabEvent = {x: number, y: number, isTouch?: boolean, event: TouchEvent | MouseEvent};

export default function attachGrabListeners(element: HTMLElement,
  onStart: (position: GrabEvent) => void,
  onMove: (position: GrabEvent) => void,
  onEnd?: (position: GrabEvent) => void) {
  // * Mouse
  const onMouseMove = (event: MouseEvent) => {
    onMove({x: event.pageX, y: event.pageY, event});
  };

  const onMouseUp = (event: MouseEvent) => {
    document.removeEventListener('mousemove', onMouseMove);
    element.addEventListener('mousedown', onMouseDown, {once: true});
    onEnd?.({x: event.pageX, y: event.pageY, event});
  };

  const onMouseDown = (event: MouseEvent) => {
    if(event.button !== 0) {
      element.addEventListener('mousedown', onMouseDown, {once: true});
      return;
    }

    onStart({x: event.pageX, y: event.pageY, event});
    onMouseMove(event);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp, {once: true});
  };

  element.addEventListener('mousedown', onMouseDown, {once: true});

  // * Touch
  const onTouchMove = (event: TouchEvent) => {
    event.preventDefault();
    onMove({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true, event});
  };

  const onTouchEnd = (event: TouchEvent) => {
    document.removeEventListener('touchmove', onTouchMove);
    element.addEventListener('touchstart', onTouchStart, {passive: false, once: true});
    const touch = event.touches[0] || event.changedTouches[0];
    onEnd?.({x: touch.clientX, y: touch.clientY, isTouch: true, event});
  };

  const onTouchStart = (event: TouchEvent) => {
    onStart({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true, event});
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

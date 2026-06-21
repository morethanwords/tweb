export type GrabEvent = {x: number, y: number, isTouch?: boolean, event: TouchEvent | MouseEvent};

export default function attachGrabListeners(element: HTMLElement,
  onStart: (position: GrabEvent) => void,
  onMove: (position: GrabEvent) => void,
  onEnd?: (position: GrabEvent) => void) {
  // The grab MOVE/END track on `element.ownerDocument`, not the global `document`: while the client is
  // popped into a Document PiP window the element lives in THAT document, so a main-`document` move/up
  // listener never fires there and the drag (RangeSelector sliders — volume, seek bar — colorPicker,
  // etc.) sticks. ownerDocument is the element's current window and can't change mid-drag.
  // * Mouse
  const onMouseMove = (event: MouseEvent) => {
    onMove({x: event.pageX, y: event.pageY, event});
  };

  const onMouseUp = (event: MouseEvent) => {
    element.ownerDocument.removeEventListener('mousemove', onMouseMove);
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

    element.ownerDocument.addEventListener('mousemove', onMouseMove);
    element.ownerDocument.addEventListener('mouseup', onMouseUp, {once: true});
  };

  element.addEventListener('mousedown', onMouseDown, {once: true});

  // * Touch
  const onTouchMove = (event: TouchEvent) => {
    event.preventDefault();
    onMove({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true, event});
  };

  const onTouchEnd = (event: TouchEvent) => {
    element.ownerDocument.removeEventListener('touchmove', onTouchMove);
    element.addEventListener('touchstart', onTouchStart, {passive: false, once: true});
    const touch = event.touches[0] || event.changedTouches[0];
    onEnd?.({x: touch.clientX, y: touch.clientY, isTouch: true, event});
  };

  const onTouchStart = (event: TouchEvent) => {
    onStart({x: event.touches[0].clientX, y: event.touches[0].clientY, isTouch: true, event});
    onTouchMove(event);

    element.ownerDocument.addEventListener('touchmove', onTouchMove, {passive: false});
    element.ownerDocument.addEventListener('touchend', onTouchEnd, {passive: false, once: true});
  };

  element.addEventListener('touchstart', onTouchStart, {passive: false, once: true});

  return () => {
    element.removeEventListener('mousedown', onMouseDown);
    element.ownerDocument.removeEventListener('mousemove', onMouseMove);
    element.ownerDocument.removeEventListener('mouseup', onMouseUp);

    element.removeEventListener('touchstart', onTouchStart);
    element.ownerDocument.removeEventListener('touchmove', onTouchMove);
    element.ownerDocument.removeEventListener('touchend', onTouchEnd);
  };
}

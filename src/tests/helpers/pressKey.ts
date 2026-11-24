/** A key pressed on `element`: a keydown that bubbles and can be cancelled, returned to tell whether it was. */
export default function pressKey(element: Element, key: string) {
  const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
  element.dispatchEvent(event);
  return event;
}
